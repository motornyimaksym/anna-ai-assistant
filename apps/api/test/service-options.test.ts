import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingService } from '../src/booking.service.js';
import { AvailabilityService } from '../src/availability.service.js';
import type { BookingRepository, CreateStoredBooking } from '../src/repository.js';
import type { CalendarService } from '../src/calendar.js';

const service = { id: 'massage', name: 'Massage', description: '', durationMinutes: 60, price: 1500, bufferMinutes: 15, currency: 'UAH', enabled: true, durationOptions: [{ durationMinutes: 90, price: 2000 }] };
const setup = () => {
  const repository = {
    getService: vi.fn(async () => service),
    createBooking: vi.fn(async (value: CreateStoredBooking) => ({ ...value, id: 'booking' })),
    getBookingTiming: vi.fn(async () => ({ durationMinutes: 90, bufferMinutes: 15 })),
    getBooking: vi.fn(async () => ({ id: 'booking' })),
    getRules: vi.fn(async () => []),
    getExceptions: vi.fn(async () => [{ id: 'day', date: '2099-01-01', type: 'working_interval', start: '09:00', end: '11:00' }]),
    listLockedIntervals: vi.fn(async () => []),
  };
  const calendar = { isConfigured: () => false, getBusyIntervals: vi.fn(async () => []) };
  return { repository, booking: new BookingService(repository as unknown as BookingRepository, calendar as unknown as CalendarService), availability: new AvailabilityService(repository as unknown as BookingRepository, calendar as unknown as CalendarService) };
};
afterEach(() => vi.unstubAllEnvs());
describe('selected service duration', () => {
  it('uses selected duration for end time, locks, and server price snapshot', async () => {
    const { booking, repository } = setup();
    await booking.create({ clientId: 'client', telegramChatId: 'chat', serviceId: 'massage', startAt: '2099-01-01T09:00:00.000Z', durationMinutes: 90 });
    expect(repository.createBooking).toHaveBeenCalledWith(expect.objectContaining({ durationMinutes: 90, price: 2000, currency: 'UAH', endAt: '2099-01-01T10:30:00Z', lockedSlots: expect.any(Array) }));
    expect(repository.createBooking.mock.calls[0]![0].lockedSlots).toHaveLength(7);
  });
  it('requires an offered duration when a service has multiple options', async () => {
    const { booking, availability, repository } = setup();
    const input = { clientId: 'client', telegramChatId: 'chat', serviceId: 'massage', startAt: '2099-01-01T09:00:00.000Z' };
    await expect(booking.create(input)).rejects.toThrow();
    await expect(booking.create({ ...input, durationMinutes: 45 })).rejects.toThrow();
    await expect(availability.find({ serviceId: 'massage', date: '2099-01-01' })).rejects.toThrow();
    expect(repository.createBooking).not.toHaveBeenCalled();
  });
  it('calculates available slots using the chosen length plus buffer', async () => {
    vi.stubEnv('DEFAULT_TIMEZONE', 'UTC');
    const { availability } = setup();
    const short = await availability.find({ serviceId: 'massage', date: '2099-01-01', durationMinutes: 60 });
    const long = await availability.find({ serviceId: 'massage', date: '2099-01-01', durationMinutes: 90 });
    expect(short.slots).toHaveLength(4);
    expect(long.slots).toHaveLength(2);
  });
  it('preserves legacy single-option requests and ignores caller prices', async () => {
    const { booking, repository } = setup();
    repository.getService.mockResolvedValue({ ...service, durationOptions: [] });
    const request = { clientId: 'client', telegramChatId: 'chat', serviceId: 'massage', startAt: '2099-01-01T09:00:00.000Z', price: 1 };
    await booking.create(request);
    expect(repository.createBooking).toHaveBeenCalledWith(expect.objectContaining({ durationMinutes: 60, price: 1500 }));
  });
  it('checks rescheduling against stored timing when catalog options disappear', async () => {
    vi.stubEnv('DEFAULT_TIMEZONE', 'UTC');
    const { availability, repository } = setup();
    repository.getService.mockRejectedValue(new Error('Catalog unavailable'));
    expect((await availability.findForBooking('booking', '2099-01-01')).slots).toHaveLength(2);
    expect(repository.getService).not.toHaveBeenCalled();
    expect(repository.listLockedIntervals).toHaveBeenCalledWith('booking');
  });
});
