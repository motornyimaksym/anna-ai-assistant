import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { availableSlotsRequestSchema } from '@booking/contracts';
import { AvailabilityService } from './availability.service.js';
import { BookingService } from './booking.service.js';
import { BookingRepository } from './repository.js';
export type AssistantContext = { clientId: string; telegramChatId: string; businessConnectionId?: string };
export const assistantToolSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('get_services'), arguments: z.object({}) }),
  z.object({ name: z.literal('get_available_slots'), arguments: availableSlotsRequestSchema }),
  z.object({ name: z.literal('get_bookings'), arguments: z.object({}) }),
  z.object({ name: z.literal('create_booking'), arguments: z.object({ serviceId: z.string().min(1), startAt: z.string().datetime() }) }),
  z.object({ name: z.literal('cancel_booking'), arguments: z.object({ bookingId: z.string().min(1) }) }),
  z.object({ name: z.literal('reschedule_booking'), arguments: z.object({ bookingId: z.string().min(1), startAt: z.string().datetime() }) }),
]);
@Injectable()
export class AssistantToolsService {
  constructor(private readonly repository: BookingRepository, private readonly availability: AvailabilityService, private readonly bookings: BookingService) {}
  async execute(input: unknown, context: AssistantContext): Promise<unknown> {
    const tool = assistantToolSchema.parse(input);
    switch (tool.name) {
      case 'get_services': return (await this.repository.listServices()).filter((service) => service.enabled);
      case 'get_available_slots': return this.availability.find(tool.arguments);
      case 'get_bookings': return (await this.repository.listBookings()).filter((booking) => booking.clientId === context.clientId && booking.telegramChatId === context.telegramChatId);
      case 'create_booking':
        await this.checkSlot(tool.arguments.serviceId, tool.arguments.startAt);
        return this.bookings.create({ ...tool.arguments, ...context });
      case 'cancel_booking':
        await this.ownedBooking(tool.arguments.bookingId, context);
        return this.bookings.cancel(tool.arguments.bookingId);
      case 'reschedule_booking': {
        const booking = await this.ownedBooking(tool.arguments.bookingId, context);
        if (booking.startAt === tool.arguments.startAt) return booking;
        await this.checkSlot(booking.serviceId, tool.arguments.startAt);
        return this.bookings.reschedule(booking.id, { startAt: tool.arguments.startAt });
      }
    }
  }
  private async ownedBooking(id: string, context: AssistantContext) {
    const booking = await this.repository.getBooking(id);
    if (!booking || booking.clientId !== context.clientId || booking.telegramChatId !== context.telegramChatId) throw new Error('Booking not found');
    return booking;
  }
  private async checkSlot(serviceId: string, startAt: string) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(startAt));
    if (Date.parse(startAt) <= Date.now()) throw new Error('Time is in the past');
    const { slots } = await this.availability.find({ serviceId, date });
    if (!slots.includes(startAt)) throw new Error('Time is unavailable');
  }
}
