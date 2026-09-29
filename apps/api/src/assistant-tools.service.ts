import { MediaStoreService } from './media-store.service.js';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { createBookingRequestSchema, mediaIdSchema } from '@booking/contracts';
import { BookingContextService } from './booking-context.service.js';
import { BookingService } from './booking.service.js';
import { BookingRepository } from './repository.js';
import { selectServiceOption } from './service-options.js';
import { randomUUID } from 'node:crypto';
export type AssistantContext = { clientId: string; telegramChatId: string; businessConnectionId?: string; traceId?: string; currentMessage?: string };
const bookingArguments = z.object({ serviceId: z.string().min(1), durationMinutes: z.number().int().min(15).max(480), startAt: z.string().datetime() }).strict();
const explicitConfirmation = /^(?:(?:так[,\s]+)?(?:підтверджую(?: запис)?|все підходить|усе підходить|мені підходить|мене все влаштовує|записуйте|запишіть мене|підходить|добре|ок)|так|yes|yes,? confirm|i confirm|confirm|book it|ok|okay)[.!\s]*$/iu;
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
        const localTime = new Intl.DateTimeFormat('uk-UA', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(start));
        const confirmationText = `Запис: ${service.name}, ${option.durationMinutes} хв, ${localTime}, ${option.price} ${service.currency}. Код ${randomUUID().slice(0, 8)}.`;
        const proposal = await this.repository.stageAssistantBooking(context.telegramChatId, context.clientId, { serviceId: service.id, durationMinutes: option.durationMinutes, startAt: new Date(start).toISOString(), confirmationText });
        return { status: 'prepared', confirmationText: proposal.confirmationText, expiresAt: proposal.expiresAt };
      }
      case 'create_booking': {
        if (!context.currentMessage || !explicitConfirmation.test(context.currentMessage.trim())) throw new Error('Explicit client confirmation required');
        const conversation = await this.repository.getConversation(context.telegramChatId);
        const proposal = conversation?.pendingAction;
        if (!proposal?.id || proposal.name !== 'create_booking' || !proposal.confirmationText || proposal.expiresAt <= new Date().toISOString() || conversation?.clientId !== context.clientId) throw new Error('Valid booking proposal required');
        const history = await this.repository.listMessages(context.telegramChatId);
        const latestAssistant = history.at(-1);
        if (latestAssistant?.role !== 'assistant' || !readable(latestAssistant.content).includes(proposal.confirmationText)) throw new Error('Booking proposal was not delivered');
        const consumed = await this.repository.consumeAssistantBooking(context.telegramChatId, context.clientId, proposal.id);
        if (JSON.stringify(consumed) !== JSON.stringify(proposal)) throw new Error('Booking proposal changed before confirmation');
        const args = bookingArguments.parse(consumed.arguments);
        const booking = await this.bookings.create(createBookingRequestSchema.parse({ ...args, clientId: context.clientId, telegramChatId: context.telegramChatId, ...(context.businessConnectionId ? { businessConnectionId: context.businessConnectionId } : {}) }));
        return { status: 'created', booking };
      }
    }
  }
}
