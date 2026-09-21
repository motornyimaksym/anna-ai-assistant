import { Injectable } from '@nestjs/common';
import { telegramToolArgsSchema } from '@booking/contracts';
import { AvailabilityService } from './availability.service.js'; import { BookingService } from './booking.service.js'; import { BookingRepository } from './repository.js';
@Injectable()
export class AssistantToolsService {
  constructor(private readonly repository: BookingRepository, private readonly availability: AvailabilityService, private readonly bookings: BookingService) {}
  async execute(input: unknown): Promise<unknown> { const tool = telegramToolArgsSchema.parse(input); switch (tool.name) { case 'get_services': return this.repository.listServices().filter((service) => service.enabled); case 'get_available_slots': return this.availability.find(tool.arguments); case 'create_booking': return this.bookings.create(tool.arguments); case 'get_bookings': return this.repository.listBookings().filter((booking) => booking.clientId === tool.arguments.clientId); case 'cancel_booking': return this.bookings.cancel(tool.arguments.bookingId); case 'reschedule_booking': return this.bookings.reschedule(tool.arguments.bookingId, { startAt: tool.arguments.startAt }); } }
}
