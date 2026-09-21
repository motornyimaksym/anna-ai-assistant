import { Injectable } from '@nestjs/common';
import type { AvailabilityRuleDto, BookingDto, ConversationDto, ScheduleExceptionDto, ServiceDto } from '@booking/contracts';
import { BookingConflictError, BookingNotFoundError } from '@booking/domain';

export type CreateStoredBooking = Omit<BookingDto, 'id' | 'createdAt' | 'updatedAt'> & { lockedSlots: string[] };
@Injectable()
export class BookingRepository {
  private readonly bookings = new Map<string, BookingDto>(); private readonly locks = new Map<string, string>(); private readonly services = new Map<string, ServiceDto>(); private readonly conversations = new Map<string, ConversationDto>(); private readonly updateIds = new Set<number>();
  private rules: AvailabilityRuleDto[] = []; private exceptions: ScheduleExceptionDto[] = [];
  private sequence = 0;
  private transaction<T>(operation: () => T): T { return operation(); }
  listServices(): ServiceDto[] { return [...this.services.values()]; }
  getService(id: string): ServiceDto | undefined { return this.services.get(id); }
  saveService(service: ServiceDto): ServiceDto { this.services.set(service.id, service); return service; }
  listBookings(): BookingDto[] { return [...this.bookings.values()].sort((a, b) => a.startAt.localeCompare(b.startAt)); }
  getBooking(id: string): BookingDto | undefined { return this.bookings.get(id); }
  createBooking(input: CreateStoredBooking): BookingDto { return this.transaction(() => { if (input.lockedSlots.some((slot) => this.locks.has(slot))) throw new BookingConflictError(); const now = new Date().toISOString(); const booking: BookingDto = { ...input, id: `booking_${++this.sequence}`, createdAt: now, updatedAt: now }; this.bookings.set(booking.id, booking); for (const slot of input.lockedSlots) this.locks.set(slot, booking.id); return booking; }); }
  cancelBooking(id: string): BookingDto { return this.transaction(() => { const existing = this.bookings.get(id); if (!existing) throw new BookingNotFoundError(); if (existing.status === 'cancelled') return existing; for (const [slot, bookingId] of this.locks.entries()) if (bookingId === id) this.locks.delete(slot); const changed = { ...existing, status: 'cancelled' as const, updatedAt: new Date().toISOString() }; this.bookings.set(id, changed); return changed; }); }
  updateBookingStatus(id: string, status: BookingDto['status']): BookingDto { const existing = this.bookings.get(id); if (!existing) throw new BookingNotFoundError(); if (status === 'cancelled') return this.cancelBooking(id); const changed = { ...existing, status, updatedAt: new Date().toISOString() }; this.bookings.set(id, changed); return changed; }
  rescheduleBooking(id: string, startAt: string, endAt: string, slots: string[]): BookingDto { return this.transaction(() => { const existing = this.bookings.get(id); if (!existing) throw new BookingNotFoundError(); if (existing.status === 'cancelled') throw new BookingConflictError(); const ownSlots = new Set([...this.locks].filter(([, bookingId]) => bookingId === id).map(([slot]) => slot)); if (slots.some((slot) => this.locks.has(slot) && !ownSlots.has(slot))) throw new BookingConflictError(); for (const slot of ownSlots) this.locks.delete(slot); for (const slot of slots) this.locks.set(slot, id); const changed = { ...existing, startAt, endAt, updatedAt: new Date().toISOString(), calendarSyncStatus: 'pending' as const }; this.bookings.set(id, changed); return changed; }); }
  setCalendarSync(id: string, status: BookingDto['calendarSyncStatus'], eventId?: string): void { const booking = this.bookings.get(id); if (booking) this.bookings.set(id, { ...booking, calendarSyncStatus: status, googleCalendarEventId: eventId ?? booking.googleCalendarEventId, updatedAt: new Date().toISOString() }); }
  listLockedIntervals(): { start: string; end: string }[] { return this.listBookings().filter((booking) => booking.status !== 'cancelled').map((booking) => ({ start: booking.startAt, end: booking.endAt })); }
  getRules(): AvailabilityRuleDto[] { return this.rules; }
  setRules(rules: AvailabilityRuleDto[]): void { this.rules = rules; }
  getExceptions(): ScheduleExceptionDto[] { return this.exceptions; }
  saveException(item: ScheduleExceptionDto): ScheduleExceptionDto { this.exceptions = [...this.exceptions.filter((entry) => entry.id !== item.id), item]; return item; }
  deleteException(id: string): void { this.exceptions = this.exceptions.filter((entry) => entry.id !== id); }
  getConversation(chatId: string): ConversationDto | undefined { return this.conversations.get(chatId); }
  saveConversation(conversation: ConversationDto): ConversationDto { this.conversations.set(conversation.telegramChatId, conversation); return conversation; }
  listConversations(): ConversationDto[] { return [...this.conversations.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  claimTelegramUpdate(updateId: number): boolean { if (this.updateIds.has(updateId)) return false; this.updateIds.add(updateId); return true; }
}
