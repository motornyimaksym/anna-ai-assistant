import { Injectable } from '@nestjs/common';
import type { CreateBookingRequest, RescheduleBookingRequest } from '@booking/contracts';
import { BookingConflictError, ServiceNotFoundError, lockedSlotKeys, serviceEndAt } from '@booking/domain';
import { CalendarService } from './calendar.js'; import { BookingRepository } from './repository.js';
@Injectable()
export class BookingService {
  constructor(private readonly repository: BookingRepository, private readonly calendar: CalendarService) {}
  create(input: CreateBookingRequest) { const service = this.repository.getService(input.serviceId); if (!service || !service.enabled) throw new ServiceNotFoundError(); const endAt = serviceEndAt(input.startAt, service); const booking = this.repository.createBooking({ ...input, endAt, status: 'confirmed', calendarSyncStatus: 'pending', lockedSlots: lockedSlotKeys('default', input.startAt, endAt, service.bufferMinutes) }); void this.syncCreated(booking.id); return booking; }
  async syncCreated(id: string): Promise<void> { const booking = this.repository.getBooking(id); if (!booking || !this.calendar.isConfigured()) return; try { const eventId = await this.calendar.createBookingEvent(booking); this.repository.setCalendarSync(id, 'synced', eventId); } catch { this.repository.setCalendarSync(id, 'failed'); } }
  async cancel(id: string) { const booking = this.repository.cancelBooking(id); if (booking.googleCalendarEventId) { try { await this.calendar.deleteBookingEvent(booking.googleCalendarEventId); } catch { this.repository.setCalendarSync(id, 'failed'); } } return booking; }
  async reschedule(id: string, input: RescheduleBookingRequest) { const booking = this.repository.getBooking(id); if (!booking) throw new BookingConflictError(); const service = this.repository.getService(booking.serviceId); if (!service) throw new ServiceNotFoundError(); const endAt = serviceEndAt(input.startAt, service); const changed = this.repository.rescheduleBooking(id, input.startAt, endAt, lockedSlotKeys('default', input.startAt, endAt, service.bufferMinutes)); try { await this.calendar.updateBookingEvent(changed); this.repository.setCalendarSync(id, 'synced'); } catch { this.repository.setCalendarSync(id, 'failed'); } return this.repository.getBooking(id)!; }
}
