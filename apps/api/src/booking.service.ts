import { selectServiceOption } from './service-options.js';
import { Injectable } from '@nestjs/common';
import type { CreateBookingRequest, RescheduleBookingRequest } from '@booking/contracts';
import { ServiceNotFoundError, lockedSlotKeys, serviceEndAt } from '@booking/domain';
import { CalendarService } from './calendar.js'; import { BookingRepository } from './repository.js';
@Injectable()
export class BookingService {
  constructor(private readonly repository: BookingRepository, private readonly calendar: CalendarService) {}
  async create(input: CreateBookingRequest) { const service = await this.repository.getService(input.serviceId); if (!service || !service.enabled) throw new ServiceNotFoundError(); const option = selectServiceOption(service, input.durationMinutes); const endAt = serviceEndAt(input.startAt, option); const booking = await this.repository.createBooking({ ...input, ...option, currency: service.currency, endAt, status: 'confirmed', calendarSyncStatus: 'pending', lockedSlots: lockedSlotKeys('default', input.startAt, endAt, service.bufferMinutes), bufferMinutes: service.bufferMinutes }); await this.syncCreated(booking.id); return (await this.repository.getBooking(booking.id))!; }
  async syncCreated(id: string): Promise<void> { const booking = await this.repository.getBooking(id); if (!booking) return; try { if (!await this.calendar.isConfigured()) return; const result = await this.calendar.createBookingEvent(booking); await this.repository.setCalendarSync(id, 'synced', result.eventId, result.calendarId); } catch { await this.repository.setCalendarSync(id, 'failed'); } }
  async cancel(id: string) {
    const booking = await this.repository.cancelBooking(id);
    if (booking.googleCalendarEventId) {
      try { await this.calendar.deleteBookingEvent(booking.googleCalendarEventId, booking.googleCalendarId); }
      catch { await this.repository.setCalendarSync(id, 'failed'); }
    }
    return (await this.repository.getBooking(id))!;
  }
  async reschedule(id: string, input: RescheduleBookingRequest) { const changed = await this.repository.rescheduleBooking(id, input.startAt); try { if (await this.calendar.isConfigured()) { await this.calendar.updateBookingEvent(changed); await this.repository.setCalendarSync(id, 'synced'); } } catch { await this.repository.setCalendarSync(id, 'failed'); } return (await this.repository.getBooking(id))!; }
}
