import { MediaStoreService } from './media-store.service.js';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { mediaIdSchema } from '@booking/contracts';
import { BookingContextService } from './booking-context.service.js';
import { BookingService } from './booking.service.js';
import { BookingRepository } from './repository.js';
export type AssistantContext = { clientId: string; telegramChatId: string; businessConnectionId?: string; traceId?: string };
export const assistantToolSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('get_media'), arguments: z.object({}).strict() }),
  z.object({ name: z.literal('send_media'), arguments: z.object({ mediaId: mediaIdSchema }).strict() }),
  z.object({ name: z.literal('get_services'), arguments: z.object({}) }),
  z.object({ name: z.literal('get_booking_context'), arguments: z.object({}).strict() }),
  z.object({ name: z.literal('get_bookings'), arguments: z.object({}) }),
]);
@Injectable()
export class AssistantToolsService {
  @Inject(MediaStoreService) private readonly media!: MediaStoreService;
  constructor(private readonly repository: BookingRepository, private readonly bookings: BookingService, private readonly bookingContext: BookingContextService) {}
  async execute(input: unknown, context: AssistantContext): Promise<unknown> {
    const tool = assistantToolSchema.parse(input);
    switch (tool.name) {
      case 'get_media': return this.media.available(context.telegramChatId);
      case 'send_media': return this.media.send(tool.arguments.mediaId, context.telegramChatId, context.businessConnectionId);
      case 'get_services': return (await this.repository.listServices()).filter((service) => service.enabled);
      case 'get_bookings': return (await this.bookings.list()).filter((booking) => booking.clientId === context.clientId && booking.telegramChatId === context.telegramChatId);
      case 'get_booking_context': return this.bookingContext.read();
    }
  }
}
