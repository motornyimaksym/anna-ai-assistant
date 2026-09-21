import { describe, expect, it } from 'vitest';
import { BookingConflictError } from '@booking/domain';
import { BookingService } from '../src/booking.service.js'; import { CalendarService } from '../src/calendar.js'; import { BookingRepository } from '../src/repository.js';
const setup = () => { const repository = new BookingRepository(); repository.saveService({ id: 'massage-60', name: 'Massage', description: '', durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH', enabled: true }); return { repository, service: new BookingService(repository, new CalendarService()) }; };
describe('BookingService', () => {
  it('allows only one concurrent reservation for a locked slot', () => { const { service } = setup(); const input = { clientId: 'one', serviceId: 'massage-60', startAt: '2026-09-21T07:00:00.000Z', telegramChatId: '1' }; service.create(input); expect(() => service.create({ ...input, clientId: 'two', telegramChatId: '2' })).toThrow(BookingConflictError); });
  it('releases locks after cancellation', async () => { const { service } = setup(); const booking = service.create({ clientId: 'one', serviceId: 'massage-60', startAt: '2026-09-21T07:00:00.000Z', telegramChatId: '1' }); await service.cancel(booking.id); expect(service.create({ clientId: 'two', serviceId: 'massage-60', startAt: booking.startAt, telegramChatId: '2' }).id).toBeTruthy(); });
  it('preserves the original booking when rescheduling conflicts', async () => { const { service, repository } = setup(); const first = service.create({ clientId: 'one', serviceId: 'massage-60', startAt: '2026-09-21T07:00:00.000Z', telegramChatId: '1' }); service.create({ clientId: 'two', serviceId: 'massage-60', startAt: '2026-09-21T09:00:00.000Z', telegramChatId: '2' }); await expect(service.reschedule(first.id, { startAt: '2026-09-21T09:00:00.000Z' })).rejects.toThrow(BookingConflictError); expect(repository.getBooking(first.id)?.startAt).toBe(first.startAt); });
});

