import { describe, expect, it, vi } from 'vitest';
import { AssistantToolsService } from '../src/assistant-tools.service.js';
const context = { clientId: 'alice', telegramChatId: 'chat' };
describe('read-only assistant tools', () => {
  const bookings = { list: vi.fn(async () => [{ id: 'foreign', clientId: 'bob', telegramChatId: 'other' }, { id: 'own', ...context }]), create: vi.fn(), cancel: vi.fn(), reschedule: vi.fn() };
  const bookingContext = { read: vi.fn(async () => ({ schedule: { status: 'unavailable' }, calendar: { status: 'unavailable' } })) };
  const tools = new AssistantToolsService({} as never, bookings as never, bookingContext as never);
  it('binds listing to current sender and chat', async () => {
    expect(await tools.execute({ name: 'get_bookings', arguments: {} }, context)).toEqual([{ id: 'own', ...context }]);
  });
  it.each(['create_booking', 'cancel_booking', 'reschedule_booking', 'plan_booking'])('rejects removed tool %s', async (name) => {
    await expect(tools.execute({ name, arguments: { bookingId: 'own', serviceId: 'massage', startAt: '2099-01-01T10:00:00.000Z' } }, context)).rejects.toThrow();
    expect(bookings.create).not.toHaveBeenCalled(); expect(bookings.cancel).not.toHaveBeenCalled(); expect(bookings.reschedule).not.toHaveBeenCalled();
  });
  it('supplies raw context without authoring messages', async () => {
    expect(await tools.execute({ name: 'get_booking_context', arguments: {} }, context)).toEqual(await bookingContext.read());
  });
});
