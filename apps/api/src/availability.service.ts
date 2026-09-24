import { Injectable } from '@nestjs/common';
import type { AvailableSlotsRequest } from '@booking/contracts';
import { ServiceNotFoundError, generateAvailableSlots } from '@booking/domain';
import { CalendarService } from './calendar.js';
import { BookingRepository } from './repository.js';
import { selectServiceOption } from './service-options.js';

@Injectable()
export class AvailabilityService {
  constructor(private readonly repository: BookingRepository, private readonly calendar: CalendarService) {}
  async find(input: AvailableSlotsRequest) {
    const service = await this.repository.getService(input.serviceId);
    if (!service || !service.enabled) throw new ServiceNotFoundError();
    const option = selectServiceOption(service, input.durationMinutes);
    return this.findWithTiming(input, { durationMinutes: option.durationMinutes, bufferMinutes: service.bufferMinutes });
  }
  async findForBooking(bookingId: string, date: string) {
    return this.findWithTiming({ date }, await this.repository.getBookingTiming(bookingId), bookingId);
  }
  private async findWithTiming(input: { date: string; after?: string; before?: string }, service: { durationMinutes: number; bufferMinutes: number }, excludeBookingId?: string) {
    const start = `${input.date}T00:00:00.000Z`;
    const end = `${input.date}T23:59:59.999Z`;
    const [busy, rules, exceptions, occupied] = await Promise.all([this.calendar.getBusyIntervals(start, end), this.repository.getRules(), this.repository.getExceptions(), this.repository.listLockedIntervals(excludeBookingId)]);
    return { slots: generateAvailableSlots({ ...input, timezone: process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv', service, rules, exceptions, occupied, busy }) };
  }
}
