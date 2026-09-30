import { BookingPreparationError } from './booking-preparation-errors.js';
import { MediaStoreService } from './media-store.service.js';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { createBookingRequestSchema, mediaIdSchema } from '@booking/contracts';
import { BookingContextService } from './booking-context.service.js';
import { BookingService } from './booking.service.js';
import { BookingRepository } from './repository.js';
import { selectServiceOption } from './service-options.js';
import { bookingConfirmationMismatches } from './booking-confirmation.js';
import { bookingProposalError, bookingProposalFactError } from './booking-proposal-errors.js';
import type { BookingEventContext } from './calendar.js';
export type AssistantContext = { clientId: string; telegramChatId: string; businessConnectionId?: string; traceId?: string; currentMessage?: string; telegramUsername?: string; telegramDisplayName?: string };
const bookingArguments = z.object({ serviceId: z.string().min(1), durationMinutes: z.number().int().min(15).max(480), startAt: z.string().datetime({ offset: true }) }).strict();
export const assistantToolSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('get_media'), arguments: z.object({}).strict() }),
  z.object({ name: z.literal('send_media'), arguments: z.object({ mediaId: mediaIdSchema }).strict() }),
  z.object({ name: z.literal('get_services'), arguments: z.object({}) }),
  z.object({ name: z.literal('get_booking_context'), arguments: z.object({}).strict() }),
  z.object({ name: z.literal('get_bookings'), arguments: z.object({}) }),
  z.object({ name: z.literal('prepare_booking'), arguments: bookingArguments }),
  z.object({ name: z.literal('create_booking'), arguments: z.object({}).strict() }),
  z.object({ name: z.literal('request_human_assistance'), arguments: z.object({}).strict() }),
]);
@Injectable()
export class AssistantToolsService {
  @Inject(MediaStoreService) private readonly media!: MediaStoreService;
  constructor(private readonly repository: BookingRepository, private readonly bookings: BookingService, private readonly bookingContext: BookingContextService) {}
  async execute(input: unknown, context: AssistantContext): Promise<unknown> {
    const tool = assistantToolSchema.parse(input);
    switch (tool.name) {
      case 'request_human_assistance': {
        if (!context.currentMessage?.trim()) throw new Error('Client request required for human assistance');
        return { status: 'human_requested' };
      }
      case 'get_media': return this.media.available(context.telegramChatId);
      case 'send_media': return this.media.send(tool.arguments.mediaId, context.telegramChatId, context.businessConnectionId);
      case 'get_services': return (await this.repository.listServices()).filter((service) => service.enabled);
      case 'get_bookings': return (await this.bookings.list()).filter((booking) => booking.clientId === context.clientId && booking.telegramChatId === context.telegramChatId);
      case 'get_booking_context': return this.bookingContext.read();
      case 'prepare_booking': {
        const service = await this.repository.getService(tool.arguments.serviceId);
        if (!service?.enabled) throw new BookingPreparationError('BOOKING_SERVICE_UNAVAILABLE');
        let option: ReturnType<typeof selectServiceOption>;
        try { option = selectServiceOption(service, tool.arguments.durationMinutes); }
        catch { throw new BookingPreparationError('BOOKING_DURATION_UNAVAILABLE'); }
        const evidence = await this.bookingContext.read();
        const start = Date.parse(tool.arguments.startAt);
        const end = start + (option.durationMinutes + service.bufferMinutes) * 60_000;
        if (evidence.schedule.status !== 'ready') throw new BookingPreparationError('BOOKING_SCHEDULE_UNAVAILABLE');
        if (evidence.calendar.status !== 'ready') throw new BookingPreparationError('BOOKING_CALENDAR_UNAVAILABLE');
        if (!Number.isFinite(start) || start <= Date.now()) throw new BookingPreparationError('BOOKING_TIME_INVALID');
        if (start < Date.parse(evidence.calendar.rangeStart) || end > Date.parse(evidence.calendar.rangeEnd)) throw new BookingPreparationError('BOOKING_RANGE_UNAVAILABLE');
        if (evidence.calendar.busy.some(({ start: busyStart, end: busyEnd }) => Date.parse(busyStart) < end && Date.parse(busyEnd) > start)) throw new BookingPreparationError('BOOKING_TIME_BUSY');
        const zone = process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv';
        const date = new Date(start);
        const confirmationFacts = {
          serviceName: service.name,
          durationMinutes: option.durationMinutes,
          localDate: new Intl.DateTimeFormat('uk-UA', { timeZone: zone, dateStyle: 'medium' }).format(date),
          localTime: new Intl.DateTimeFormat('uk-UA', { timeZone: zone, timeStyle: 'short' }).format(date),
          price: option.price,
          currency: service.currency,
        };
        const proposal = await this.repository.stageAssistantBooking(context.telegramChatId, context.clientId, { serviceId: service.id, durationMinutes: option.durationMinutes, startAt: date.toISOString(), confirmationFacts });
        if (!proposal.id) throw new Error('Booking proposal ID missing');
        return { status: 'prepared', proposalId: proposal.id, confirmationFacts: proposal.confirmationFacts, expiresAt: proposal.expiresAt };
      }
      case 'create_booking': {
        const conversation = await this.repository.getConversation(context.telegramChatId);
        const proposal = conversation?.pendingAction;
        if (!proposal) throw bookingProposalError('missing', 'Valid booking proposal required');
        if (proposal.name !== 'create_booking') throw bookingProposalError('wrong_action', 'Valid booking proposal required');
        if (!proposal.id || !proposal.confirmationFacts) throw bookingProposalError('incomplete', 'Valid booking proposal required');
        if (proposal.expiresAt <= new Date().toISOString()) throw bookingProposalError('expired', 'Valid booking proposal required');
        if (conversation.clientId !== context.clientId) throw bookingProposalError('client_mismatch', 'Valid booking proposal required');
        const history = await this.repository.listMessagesForBookingCheck(context.telegramChatId);
        const latestAssistant = [...history].reverse().find((message) => message.role === 'assistant' && message.bookingProposalId === proposal.id) ?? history.at(-1);
        if (latestAssistant?.role !== 'assistant') throw bookingProposalError('undelivered', 'Booking proposal was not delivered accurately');
        const factIssues = bookingConfirmationMismatches(latestAssistant.content, proposal.confirmationFacts);
        if (factIssues.length) throw bookingProposalFactError(factIssues, 'Booking proposal was not delivered accurately');
        const bindingMatches = latestAssistant?.bookingProposalId
          ? latestAssistant.bookingProposalId === proposal.id
          : Boolean(proposal.confirmationFacts.referenceCode);
        if (!bindingMatches) throw bookingProposalError('binding_mismatch', 'Booking proposal was not delivered accurately');
        if (!context.currentMessage?.trim()) throw new Error('Current client message required for booking');
        const consumed = await this.repository.consumeAssistantBooking(context.telegramChatId, context.clientId, proposal.id);
        if (JSON.stringify(consumed) !== JSON.stringify(proposal)) throw bookingProposalError('replaced', 'Booking proposal changed before confirmation');
        const args = bookingArguments.parse(consumed.arguments);
        const eventContext: BookingEventContext = {
          ...(context.telegramUsername ? { telegramUsername: context.telegramUsername } : {}),
          ...(context.telegramDisplayName ? { telegramDisplayName: context.telegramDisplayName } : {}),
          messages: [
            ...history.slice(-19).map(({ role, content }) => ({ role, content })),
            { role: 'user', content: context.currentMessage },
          ],
        };
        const booking = await this.bookings.create(createBookingRequestSchema.parse({ ...args, clientId: context.clientId, telegramChatId: context.telegramChatId, ...(context.businessConnectionId ? { businessConnectionId: context.businessConnectionId } : {}) }), eventContext);
        return { status: 'created', booking };
      }
    }
  }
}
