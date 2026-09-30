import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import type { BookingDto, CreateBookingRequest, RescheduleBookingRequest } from '@booking/contracts';
import { ServiceNotFoundError, serviceEndAt } from '@booking/domain';
import { selectServiceOption } from './service-options.js';
import { CalendarService, type BookingEventContext } from './calendar.js';
import { BookingRepository } from './repository.js';

export class BookingNeedsHumanError extends ConflictException {
  constructor(readonly bookingId: string) { super(`Booking ${bookingId} requires human review in Google Calendar.`); }
}

@Injectable()
export class BookingService {
  constructor(private readonly repository: BookingRepository, private readonly calendar: CalendarService) {}
  private async assertNoConflict(startAt: string, durationMinutes: number, bufferMinutes: number, exclude?: BookingDto) {
    const from = Date.parse(startAt);
    if (!Number.isFinite(from) || from <= Date.now()) throw new Error('Time is in the past or invalid');
    const through = new Date(from + (durationMinutes + bufferMinutes) * 60_000).toISOString();
    const busy = await this.calendar.getBusyIntervals(startAt, through, exclude);
    if (busy.some(({ start, end }) => Date.parse(start) < Date.parse(through) && Date.parse(end) > from)) throw new Error('Time is unavailable');
  }
  async list() { return this.calendar.listBookings(); }
  async get(id: string) { return this.calendar.getBooking(id); }
  async timing(id: string) { return this.calendar.getBookingTiming(id); }
  async create(input: CreateBookingRequest, eventContext: BookingEventContext = {}): Promise<BookingDto> {
    const service = await this.repository.getService(input.serviceId);
    if (!service?.enabled) throw new ServiceNotFoundError();
    const option = selectServiceOption(service, input.durationMinutes);
    await this.assertNoConflict(input.startAt, option.durationMinutes, service.bufferMinutes);
    const id = randomUUID(); const now = new Date().toISOString();
    const booking: BookingDto = { ...input, id, durationMinutes: option.durationMinutes, price: option.price, currency: service.currency, endAt: serviceEndAt(input.startAt, option), status: 'confirmed', googleCalendarId: await this.calendar.destination(), calendarSyncStatus: 'synced', createdAt: now, updatedAt: now };
    try {
      const { eventId, calendarId } = await this.calendar.createBookingEvent(booking, service.name, service.bufferMinutes, eventContext);
      const created = { ...booking, googleCalendarEventId: eventId, googleCalendarId: calendarId };
      if (!await this.calendar.verifyBookingEvent(created)) throw new Error('Calendar event could not be verified');
      await this.assertNoConflict(created.startAt, option.durationMinutes, service.bufferMinutes, created);
      return created;
    } catch { throw new BookingNeedsHumanError(id); }
  }
  async cancel(id: string): Promise<BookingDto> {
    const booking = await this.calendar.getBooking(id);
    if (!booking) throw new Error('Booking unavailable');
    try {
      await this.calendar.deleteBookingEvent(booking.googleCalendarEventId!, booking.googleCalendarId, booking);
      if (await this.calendar.getBooking(id)) throw new Error('Calendar deletion could not be verified');
      return { ...booking, status: 'cancelled', updatedAt: new Date().toISOString() };
    } catch { throw new BookingNeedsHumanError(id); }
  }
  async reschedule(id: string, input: RescheduleBookingRequest): Promise<BookingDto> {
    const booking = await this.calendar.getBooking(id);
    if (!booking) throw new Error('Booking unavailable');
    if (Date.parse(booking.startAt) === Date.parse(input.startAt)) return booking;
    const timing = await this.calendar.getBookingTiming(id);
    await this.assertNoConflict(input.startAt, timing.durationMinutes, timing.bufferMinutes, booking);
    const target = { ...booking, startAt: input.startAt, endAt: serviceEndAt(input.startAt, timing), updatedAt: new Date().toISOString() };
    try {
      await this.calendar.updateBookingEvent(target, booking);
      const changed = await this.calendar.getBooking(id);
      if (!changed || Date.parse(changed.startAt) !== Date.parse(target.startAt)) throw new Error('Calendar update could not be verified');
      await this.assertNoConflict(changed.startAt, timing.durationMinutes, timing.bufferMinutes, changed);
      return changed;
    } catch { throw new BookingNeedsHumanError(id); }
  }
}
