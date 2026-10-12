import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { bookingSchema, type BookingDto, type CreateBookingRequest, type RescheduleBookingRequest } from '@booking/contracts';
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
  private async assertNoConflict(startAt: string, durationMinutes: number, bufferMinutes: number, exclude?: BookingDto, ignoreLockOwnerId?: string) {
    const from = Date.parse(startAt);
    if (!Number.isFinite(from) || from <= Date.now()) throw new Error('Time is in the past or invalid');
    const through = new Date(from + (durationMinutes + bufferMinutes) * 60_000).toISOString();
    const busy = await this.calendar.getBusyIntervals(startAt, through, exclude);
    if (busy.some(({ start, end }) => Date.parse(start) < Date.parse(through) && Date.parse(end) > from)) throw new Error('Time is unavailable');
    const locks = await this.repository.getActivePublicBookingSlotLocks();
    if (locks.some((lock) => lock.ownerId !== ignoreLockOwnerId && Date.parse(lock.start) < Date.parse(through) && Date.parse(lock.end) > from)) throw new Error('Time is unavailable');
  }
  async list() { return this.calendar.listBookings(); }
  async hasPriorAppointment(clientId: string, telegramChatId: string) {
    const now = Date.now();
    return (await this.calendar.listBookings()).some((booking) => booking.source === 'telegram' && booking.clientId === clientId && booking.telegramChatId === telegramChatId && booking.status === 'confirmed' && Date.parse(booking.startAt) < now);
  }
  async get(id: string) { return this.calendar.getBooking(id); }
  async timing(id: string) { return this.calendar.getBookingTiming(id); }
  async create(input: CreateBookingRequest, eventContext: BookingEventContext = {}): Promise<BookingDto> {
    const service = await this.repository.getService(input.serviceId);
    if (!service?.enabled) throw new ServiceNotFoundError();
    const option = selectServiceOption(service, input.durationMinutes);
    const now = new Date().toISOString();
    return this.createManaged({ ...input, id: randomUUID(), source: 'telegram', durationMinutes: option.durationMinutes, price: option.price, currency: service.currency, endAt: serviceEndAt(input.startAt, option), status: 'confirmed', calendarSyncStatus: 'synced', createdAt: now, updatedAt: now }, service.bufferMinutes, { ...eventContext, serviceName: service.name });
  }
  async createPublic(input: { id: string; serviceId: string; serviceName: string; durationMinutes: number; bufferMinutes: number; price: number; currency: 'UAH'; startAt: string; endAt: string; clientName: string; clientContact: string }): Promise<BookingDto> {
    const now = new Date().toISOString();
    return this.createManaged({ id: input.id, serviceId: input.serviceId, durationMinutes: input.durationMinutes, price: input.price, currency: input.currency, startAt: input.startAt, endAt: input.endAt, status: 'confirmed', source: 'public_web', clientName: input.clientName, clientContact: input.clientContact, calendarSyncStatus: 'synced', createdAt: now, updatedAt: now }, input.bufferMinutes, { source: 'public_web', serviceName: input.serviceName, clientName: input.clientName, clientContact: input.clientContact });
  }
  private async createManaged(input: BookingDto, bufferMinutes: number, eventContext: BookingEventContext): Promise<BookingDto> {
    const booking = bookingSchema.parse({ ...input, googleCalendarId: await this.calendar.destination() });
    const allowReservationId = booking.source === 'public_web' ? booking.id : undefined;
    await this.assertNoConflict(booking.startAt, booking.durationMinutes!, bufferMinutes, undefined, allowReservationId);
    await this.repository.acquirePublicBookingCalendarWriteLock({ ownerId: booking.id, startAt: booking.startAt, endAt: booking.endAt, bufferMinutes, ...(allowReservationId ? { allowReservationId } : {}) });
    try {
      const { eventId, calendarId } = await this.calendar.createBookingEvent(booking, eventContext.serviceName ?? booking.serviceId, bufferMinutes, eventContext);
      const created = { ...booking, googleCalendarEventId: eventId, googleCalendarId: calendarId };
      if (!await this.calendar.verifyBookingEvent(created)) throw new Error('Calendar event could not be verified');
      await this.assertNoConflict(created.startAt, booking.durationMinutes!, bufferMinutes, created, booking.id);
      await this.repository.releasePublicBookingSlots('calendar_write', booking.id, booking.startAt, booking.endAt, bufferMinutes);
      return created;
    } catch { throw new BookingNeedsHumanError(booking.id); }
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
