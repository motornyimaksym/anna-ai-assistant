import { Injectable } from '@nestjs/common';
import type { AvailableSlotsRequest } from '@booking/contracts';
import { ServiceNotFoundError, generateAvailableSlots, localDayBounds } from '@booking/domain';
import { CalendarService } from './calendar.js';
import { BookingRepository } from './repository.js';
import { selectServiceOption } from './service-options.js';

@Injectable()
export class AvailabilityService {
  constructor(private readonly repository: BookingRepository, private readonly calendar: CalendarService) {}
  async find(input: AvailableSlotsRequest, publicOnly = false, ignoreLockOwnerId?: string) {
    const service = await this.repository.getService(input.serviceId);
    if (!service || !service.enabled || (publicOnly && (!service.publiclyAvailable || service.currency !== 'UAH'))) throw new ServiceNotFoundError();
    const option = selectServiceOption(service, input.durationMinutes);
    if (publicOnly && option.price < 500) throw new ServiceNotFoundError();
    if (publicOnly) {
      const timezone = process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv';
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const today = `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}-${parts.find((part) => part.type === 'day')!.value}`;
      const [year, month, day] = today.split('-').map(Number);
      const latest = new Date(Date.UTC(year!, month! - 1, day! + 30)).toISOString().slice(0, 10);
      if (input.date < today || input.date > latest) return { slots: [] };
    }
    const result = await this.findWithTiming(input, { durationMinutes: option.durationMinutes, bufferMinutes: service.bufferMinutes }, undefined, ignoreLockOwnerId);
    return publicOnly ? { slots: result.slots.filter((slot) => Date.parse(slot) > Date.now()) } : result;
  }
  async findForBooking(bookingId: string, date: string) {
    return this.findWithTiming({ date }, await this.calendar.getBookingTiming(bookingId), bookingId);
  }
  private async findWithTiming(input: { date: string; after?: string; before?: string }, service: { durationMinutes: number; bufferMinutes: number }, excludeBookingId?: string, ignoreLockOwnerId?: string) {
    const { start, end } = localDayBounds(input.date, process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv');
    const exclude = excludeBookingId ? await this.calendar.getBooking(excludeBookingId) : undefined;
    const [busy, rules, exceptions, locks] = await Promise.all([this.calendar.getBusyIntervals(start, end, exclude), this.repository.getRules(), this.repository.getExceptions(), this.repository.getActivePublicBookingSlotLocks()]);
    const occupied = locks.filter((lock) => lock.ownerId !== ignoreLockOwnerId && Date.parse(lock.start) < Date.parse(end) && Date.parse(lock.end) > Date.parse(start)).map(({ start: lockStart, end: lockEnd }) => ({ start: lockStart, end: lockEnd }));
    return { slots: generateAvailableSlots({ ...input, timezone: process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv', service, rules, exceptions, occupied, busy }) };
  }
}
