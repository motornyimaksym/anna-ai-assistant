import { selectServiceOption } from './service-options.js';
import { ConflictException, Injectable } from '@nestjs/common';
import type { CreateBookingRequest, RescheduleBookingRequest } from '@booking/contracts';
import { ServiceNotFoundError, lockedSlotKeys, serviceEndAt } from '@booking/domain';
import { CalendarService } from './calendar.js';
import { BookingRepository } from './repository.js';
export class BookingNeedsHumanError extends ConflictException {
  constructor(readonly bookingId: string) { super(`Booking ${bookingId} requires human review. Slots remain reserved.`); }
}
@Injectable()
export class BookingService {
  constructor(private readonly repository: BookingRepository, private readonly calendar: CalendarService) {}
  private async assertNoConflict(startAt: string, durationMinutes: number, bufferMinutes: number, exclude?: Awaited<ReturnType<BookingRepository['getBooking']>>) {
    const from = Date.parse(startAt);
    if (!Number.isFinite(from) || from <= Date.now()) throw new Error('Time is in the past or invalid');
    const through = new Date(from + (durationMinutes + bufferMinutes) * 60_000).toISOString();
    const [calendarBusy, booked] = await Promise.all([
      this.calendar.getBusyIntervals(startAt, through, exclude ?? undefined),
      this.repository.listLockedIntervals(exclude?.id),
    ]);
    if ([...calendarBusy, ...booked].some(({ start, end }) => Date.parse(start) < Date.parse(through) && Date.parse(end) > from)) throw new Error('Time is unavailable');
  }
  async create(input: CreateBookingRequest) {
    const service = await this.repository.getService(input.serviceId);
    if (!service?.enabled) throw new ServiceNotFoundError();
    const option = selectServiceOption(service, input.durationMinutes);
    await this.assertNoConflict(input.startAt, option.durationMinutes, service.bufferMinutes);
    const calendarId = await this.calendar.destination();
    const endAt = serviceEndAt(input.startAt, option);
    const booking = await this.repository.createBooking({ ...input, ...option, currency: service.currency, endAt, status: 'pending', calendarOperation: 'create', googleCalendarId: calendarId, calendarSyncStatus: 'pending', lockedSlots: lockedSlotKeys('default', input.startAt, endAt, service.bufferMinutes), bufferMinutes: service.bufferMinutes });
    return this.retry(booking.id);
  }
  async cancel(id: string) {
    const booking = await this.repository.getBooking(id);
    if (booking?.status === 'cancelled') return booking;
    await this.repository.beginOperation(id, 'cancel', undefined, await this.calendar.destination());
    return this.retry(id);
  }
  async reschedule(id: string, input: RescheduleBookingRequest) {
    const booking = await this.repository.getBooking(id);
    if (!booking || booking.status !== 'confirmed' || booking.calendarOperation) throw new Error('Booking unavailable');
    if (Date.parse(booking.startAt) === Date.parse(input.startAt)) return booking;
    const timing = await this.repository.getBookingTiming(id);
    await this.assertNoConflict(input.startAt, timing.durationMinutes, timing.bufferMinutes, booking);
    await this.repository.beginOperation(id, 'reschedule', input.startAt, await this.calendar.destination());
    return this.retry(id);
  }
  async retry(id: string) {
    const { booking, operation } = await this.repository.claimOperation(id).catch(() => { throw new BookingNeedsHumanError(id); });
    try {
      if (operation.kind === 'create') {
        if (!await this.calendar.verifyBookingEvent(booking)) {
          const timing = await this.repository.getBookingTiming(id);
          await this.assertNoConflict(booking.startAt, timing.durationMinutes, timing.bufferMinutes, booking);
          const service = await this.repository.getService(booking.serviceId);
          await this.calendar.createBookingEvent(booking, service?.name);
        }
      } else if (operation.kind === 'reschedule') {
        const target = { ...booking, startAt: operation.targetStartAt!, endAt: operation.targetEndAt! };
        const timing = await this.repository.getBookingTiming(id);
        await this.assertNoConflict(target.startAt, timing.durationMinutes, timing.bufferMinutes, booking);
        await this.calendar.updateBookingEvent(target, booking);
      } else {
        if (!booking.googleCalendarEventId) throw new Error('Calendar event reference missing');
        await this.calendar.deleteBookingEvent(booking.googleCalendarEventId, booking.googleCalendarId, booking);
      }
      return await this.repository.finishOperation(id, operation.leaseId);
    } catch {
      await this.repository.failOperation(id, operation.leaseId).catch(() => undefined);
      throw new BookingNeedsHumanError(id);
    }
  }
}
