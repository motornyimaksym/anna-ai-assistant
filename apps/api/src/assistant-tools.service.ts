import { MediaStoreService } from './media-store.service.js';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { createBookingRequestSchema, mediaIdSchema } from '@booking/contracts';
import { BookingContextService } from './booking-context.service.js';
import { BookingService } from './booking.service.js';
import { BookingRepository } from './repository.js';
import { selectServiceOption } from './service-options.js';
import { containsBookingConfirmationFacts } from './booking-confirmation.js';
export type AssistantContext = { clientId: string; telegramChatId: string; businessConnectionId?: string; traceId?: string; currentMessage?: string };
const bookingArguments = z.object({ serviceId: z.string().min(1), durationMinutes: z.number().int().min(15).max(480), startAt: z.string().datetime({ offset: true }) }).strict();
const readable = (value: string) => value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
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
        if (!service?.enabled) throw new Error('Service unavailable');
        const option = selectServiceOption(service, tool.arguments.durationMinutes);
        const evidence = await this.bookingContext.read();
        const start = Date.parse(tool.arguments.startAt);
        const end = start + (option.durationMinutes + service.bufferMinutes) * 60_000;
        if (evidence.schedule.status !== 'ready' || evidence.calendar.status !== 'ready' || !Number.isFinite(start) || start <= Date.now() || start < Date.parse(evidence.calendar.rangeStart) || end > Date.parse(evidence.calendar.rangeEnd) || evidence.calendar.busy.some(({ start: busyStart, end: busyEnd }) => Date.parse(busyStart) < end && Date.parse(busyEnd) > start)) throw new Error('Booking availability is not verified');
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
        if (!proposal?.id || proposal.name !== 'create_booking' || (!proposal.confirmationText && !proposal.confirmationFacts) || proposal.expiresAt <= new Date().toISOString() || conversation?.clientId !== context.clientId) throw new Error('Valid booking proposal required');
        const history = await this.repository.listMessagesForBookingCheck(context.telegramChatId);
        const latestAssistant = history.at(-1);
        const contentMatches = latestAssistant?.role === 'assistant' && (proposal.confirmationFacts
          ? containsBookingConfirmationFacts(latestAssistant.content, proposal.confirmationFacts)
          : Boolean(proposal.confirmationText && readable(latestAssistant.content).includes(proposal.confirmationText)));
        const hasLegacyDeliveryEvidence = proposal.confirmationFacts
          ? Boolean(proposal.confirmationFacts.referenceCode)
          : Boolean(proposal.confirmationText);
        const bindingMatches = latestAssistant?.bookingProposalId
          ? latestAssistant.bookingProposalId === proposal.id
          : hasLegacyDeliveryEvidence;
        const deliveredSummary = latestAssistant?.role === 'assistant' && contentMatches && bindingMatches;
        if (!deliveredSummary) throw new Error('Booking proposal was not delivered accurately');
        const consumed = await this.repository.consumeAssistantBooking(context.telegramChatId, context.clientId, proposal.id);
        if (JSON.stringify(consumed) !== JSON.stringify(proposal)) throw new Error('Booking proposal changed before confirmation');
        const args = bookingArguments.parse(consumed.arguments);
        const booking = await this.bookings.create(createBookingRequestSchema.parse({ ...args, clientId: context.clientId, telegramChatId: context.telegramChatId, ...(context.businessConnectionId ? { businessConnectionId: context.businessConnectionId } : {}) }));
        return { status: 'created', booking };
      }
    }
  }
}
