import { describe, expect, it, vi } from 'vitest';
import { AssistantToolsService } from '../src/assistant-tools.service.js';
import type { BookingRepository } from '../src/repository.js';
import type { AvailabilityService } from '../src/availability.service.js';
import type { BookingService } from '../src/booking.service.js';
const context = { clientId: 'alice', telegramChatId: 'chat' };
const setup = () => {
  const repository = { listBookings: vi.fn(async () => [{ id: 'foreign', clientId: 'bob', telegramChatId: 'other' }, { id: 'own', ...context }]), getBooking: vi.fn(async () => ({ id: 'foreign', clientId: 'bob', telegramChatId: 'other' })) };
  const availability = { find: vi.fn(async () => ({ slots: ['2099-01-01T10:00:00.000Z'] })) };
  const bookings = { create: vi.fn(async (input: unknown) => input), cancel: vi.fn(), reschedule: vi.fn() };
  return { repository, availability, bookings, tools: new AssistantToolsService(repository as unknown as BookingRepository, availability as unknown as AvailabilityService, bookings as unknown as BookingService) };
};
describe('assistant tool authorization', () => {
  it('binds listing to the current sender and chat', async () => {
    const { tools } = setup();
    expect(await tools.execute({ name: 'get_bookings', arguments: { clientId: 'bob' } }, context)).toEqual([{ id: 'own', ...context }]);
  });
  it('refuses another client booking', async () => {
    const { tools, bookings } = setup();
    await expect(tools.execute({ name: 'cancel_booking', arguments: { bookingId: 'foreign' } }, context)).rejects.toThrow();
    expect(bookings.cancel).not.toHaveBeenCalled();
  });
  it('uses server identity and rechecks availability before creation', async () => {
    const { tools, bookings } = setup();
    await tools.execute({ name: 'create_booking', arguments: { serviceId: 'massage', startAt: '2099-01-01T10:00:00.000Z', clientId: 'bob' } }, context);
    expect(bookings.create).toHaveBeenCalledWith({ ...context, serviceId: 'massage', startAt: '2099-01-01T10:00:00.000Z' });
  });
  it('rejects unavailable times without creating bookings', async () => {
    const { tools, bookings } = setup();
    await expect(tools.execute({ name: 'create_booking', arguments: { serviceId: 'massage', startAt: '2099-01-01T11:00:00.000Z' } }, context)).rejects.toThrow();
    expect(bookings.create).not.toHaveBeenCalled();
  });
});
