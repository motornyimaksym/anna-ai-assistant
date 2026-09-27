import { MediaStoreService } from './media-store.service.js';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { serviceDurationOptionSchema, mediaIdSchema } from '@booking/contracts';
import { BookingService } from './booking.service.js';
import { BookingRepository } from './repository.js';
export type AssistantContext = { clientId: string; telegramChatId: string; businessConnectionId?: string; traceId?: string };
export const assistantToolSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('get_media'), arguments: z.object({}).strict() }),
  z.object({ name: z.literal('send_media'), arguments: z.object({ mediaId: mediaIdSchema }).strict() }),
  z.object({ name: z.literal('get_services'), arguments: z.object({}) }),
  z.object({ name: z.literal('get_bookings'), arguments: z.object({}) }),
  z.object({ name: z.literal('create_booking'), arguments: z.object({ serviceId: z.string().min(1), startAt: z.string().datetime(), durationMinutes: serviceDurationOptionSchema.shape.durationMinutes.optional() }) }),
  z.object({ name: z.literal('cancel_booking'), arguments: z.object({ bookingId: z.string().min(1) }) }),
  z.object({ name: z.literal('reschedule_booking'), arguments: z.object({ bookingId: z.string().min(1), startAt: z.string().datetime() }) }),
]);
@Injectable()
export class AssistantToolsService {
  @Inject(MediaStoreService) private readonly media!: MediaStoreService;
  constructor(private readonly repository: BookingRepository, private readonly bookings: BookingService) {}
  async execute(input: unknown, context: AssistantContext): Promise<unknown> {
    const tool = assistantToolSchema.parse(input);
    switch (tool.name) {
      case 'get_media': return this.media.available(context.telegramChatId);
      case 'send_media': return this.media.send(tool.arguments.mediaId, context.telegramChatId, context.businessConnectionId);
      case 'get_services': return (await this.repository.listServices()).filter((service) => service.enabled);
      case 'get_bookings': return (await this.repository.listBookings()).filter((booking) => booking.clientId === context.clientId && booking.telegramChatId === context.telegramChatId);
      case 'create_booking': return this.bookings.create({ ...tool.arguments, clientId: context.clientId, telegramChatId: context.telegramChatId, businessConnectionId: context.businessConnectionId });
      case 'cancel_booking':
        await this.ownedBooking(tool.arguments.bookingId, context);
        return this.bookings.cancel(tool.arguments.bookingId);
      case 'reschedule_booking': {
        const booking = await this.ownedBooking(tool.arguments.bookingId, context);
        if (booking.startAt === tool.arguments.startAt) return booking;
        return this.bookings.reschedule(booking.id, { startAt: tool.arguments.startAt });
      }
    }
  }
  private async ownedBooking(id: string, context: AssistantContext) {
    const booking = await this.repository.getBooking(id);
    if (!booking || booking.clientId !== context.clientId || booking.telegramChatId !== context.telegramChatId) throw new Error('Booking not found');
    return booking;
  }
}
