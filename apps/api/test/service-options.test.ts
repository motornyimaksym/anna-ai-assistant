import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingService } from '../src/booking.service.js';
import { AvailabilityService } from '../src/availability.service.js';
import type { BookingRepository } from '../src/repository.js';
import type { CalendarService } from '../src/calendar.js';

const service = { id: 'massage', name: 'Massage', description: '', durationMinutes: 60, price: 1500, bufferMinutes: 15, currency: 'UAH', enabled: true, durationOptions: [{ durationMinutes: 90, price: 2000 }] };
const setup = () => {
  const repository = { getService: vi.fn(async () => service), getRules: vi.fn(async () => []), getExceptions: vi.fn(async () => [{ id: 'day', date: '2099-01-01', type: 'working_interval', start: '09:00', end: '11:00' }]), createBooking: vi.fn(), listLockedIntervals: vi.fn() };
  const calendar = { destination: vi.fn(async () => 'calendar'), getBusyIntervals: vi.fn(async (): Promise<Array<{ start: string; end: string }>> => []), createBookingEvent: vi.fn(async (booking: { id: string }) => ({ eventId: booking.id, calendarId: 'calendar' })), verifyBookingEvent: vi.fn(async () => true), getBooking: vi.fn(async () => undefined), getBookingTiming: vi.fn(async () => ({ durationMinutes: 90, bufferMinutes: 15 })) };
  return { repository, calendar, booking: new BookingService(repository as unknown as BookingRepository, calendar as unknown as CalendarService), availability: new AvailabilityService(repository as unknown as BookingRepository, calendar as unknown as CalendarService) };
};
afterEach(() => vi.unstubAllEnvs());
describe('Calendar-only service options', () => {
  const input = { clientId: 'client', telegramChatId: 'chat', serviceId: 'massage', startAt: '2099-01-01T09:00:00.000Z', durationMinutes: 90 };
  it('snapshots chosen duration and price in Calendar without Firestore booking writes', async () => {
    const { booking, repository, calendar } = setup();
    const eventContext = { telegramUsername: 'user61785', telegramDisplayName: 'Іван Петренко', messages: [{ role: 'user' as const, content: 'Підходить' }] };
    const created = await booking.create(input, eventContext);
    expect(created).toMatchObject({ durationMinutes: 90, price: 2000, currency: 'UAH' });
    expect(calendar.createBookingEvent).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 90, price: 2000, endAt: '2099-01-01T10:30:00Z' }),
      'Massage', 15,
      expect.objectContaining({ telegramUsername: expect.any(String), telegramDisplayName: expect.any(String), messages: [{ role: 'user', content: expect.any(String) }] }),
    );
    expect(repository.createBooking).not.toHaveBeenCalled(); expect(repository.listLockedIntervals).not.toHaveBeenCalled();
  });
  it('blocks Calendar conflicts through service buffer and unknown Calendar reads', async () => {
    const { booking, calendar } = setup();
    calendar.getBusyIntervals.mockResolvedValueOnce([{ start: '2099-01-01T10:35:00.000Z', end: '2099-01-01T11:00:00.000Z' }]);
    await expect(booking.create(input)).rejects.toThrow('Time is unavailable');
    calendar.getBusyIntervals.mockRejectedValueOnce(new Error('Calendar unavailable'));
    await expect(booking.create(input)).rejects.toThrow('Calendar unavailable');
    expect(calendar.createBookingEvent).not.toHaveBeenCalled();
  });
  it('requires offered duration and calculates slots with buffer', async () => {
    vi.stubEnv('DEFAULT_TIMEZONE', 'UTC');
    const { booking, availability } = setup();
    await expect(booking.create({ ...input, durationMinutes: undefined })).rejects.toThrow();
    await expect(booking.create({ ...input, durationMinutes: 45 })).rejects.toThrow();
    expect((await availability.find({ serviceId: 'massage', date: '2099-01-01', durationMinutes: 60 })).slots).toHaveLength(4);
    expect((await availability.find({ serviceId: 'massage', date: '2099-01-01', durationMinutes: 90 })).slots).toHaveLength(2);
  });
  it('uses Calendar snapshot when catalog option disappears', async () => {
    vi.stubEnv('DEFAULT_TIMEZONE', 'UTC');
    const { availability, repository, calendar } = setup();
    repository.getService.mockRejectedValue(new Error('Catalog unavailable'));
    expect((await availability.findForBooking('booking', '2099-01-01')).slots).toHaveLength(2);
    expect(calendar.getBookingTiming).toHaveBeenCalledWith('booking');
    expect(repository.getService).not.toHaveBeenCalled();
  });
});
