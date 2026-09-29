import { describe, expect, it, vi } from 'vitest';
import { AssistantToolsService } from '../src/assistant-tools.service.js';
const context = { clientId: 'alice', telegramChatId: 'chat' };
describe('assistant tools', () => {
  const bookings = { list: vi.fn(async () => [{ id: 'foreign', clientId: 'bob', telegramChatId: 'other' }, { id: 'own', ...context }]), create: vi.fn(), cancel: vi.fn(), reschedule: vi.fn() };
  const bookingContext = { read: vi.fn(async () => ({ schedule: { status: 'unavailable' }, calendar: { status: 'unavailable' } })) };
  const tools = new AssistantToolsService({} as never, bookings as never, bookingContext as never);
  it('binds listing to current sender and chat', async () => {
    expect(await tools.execute({ name: 'get_bookings', arguments: {} }, context)).toEqual([{ id: 'own', ...context }]);
  });
  it.each(['cancel_booking', 'reschedule_booking', 'plan_booking'])('rejects removed tool %s', async (name) => {
    await expect(tools.execute({ name, arguments: { bookingId: 'own', serviceId: 'massage', startAt: '2099-01-01T10:00:00.000Z' } }, context)).rejects.toThrow();
    expect(bookings.create).not.toHaveBeenCalled(); expect(bookings.cancel).not.toHaveBeenCalled(); expect(bookings.reschedule).not.toHaveBeenCalled();
  });
  it('supplies raw context without authoring messages', async () => {
    expect(await tools.execute({ name: 'get_booking_context', arguments: {} }, context)).toEqual(await bookingContext.read());
  });
  it('requires a client message and no arguments, without classifying message words', async () => {
    await expect(tools.execute({ name: 'request_human_assistance', arguments: { detail: 'invented' } }, { ...context, currentMessage: 'Custom hot stone massage?' })).rejects.toThrow();
    await expect(tools.execute({ name: 'request_human_assistance', arguments: {} }, { ...context, currentMessage: '  ' })).rejects.toThrow('Client request required');
    expect(await tools.execute({ name: 'request_human_assistance', arguments: {} }, { ...context, currentMessage: 'Custom hot stone massage?' })).toEqual({ status: 'human_requested' });
    expect(await tools.execute({ name: 'request_human_assistance', arguments: {} }, { ...context, currentMessage: 'Is lingam massage customized for me?' })).toEqual({ status: 'human_requested' });
  });
  it('creates only a confirmed, delivered proposal bound to the current client', async () => {
    const utcStart = new Date(Math.ceil((Date.now() + 24 * 60 * 60_000) / 1000) * 1000);
    const startAt = `${new Date(utcStart.getTime() + 3 * 60 * 60_000).toISOString().slice(0, 19)}+03:00`;
    const normalizedStartAt = utcStart.toISOString();
    const service = { id: 'massage', name: 'Massage', durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH', enabled: true };
    let proposal: { id: string; name: 'create_booking'; arguments: { serviceId: string; durationMinutes: number; startAt: string }; confirmationText: string; expiresAt: string } | undefined;
    let delivered = false;
    let superseded = false;
    let consumed = false;
    const repository = {
      getService: vi.fn(async () => service),
      stageAssistantBooking: vi.fn(async (_chat: string, _client: string, args: typeof service & { startAt: string; confirmationText: string }) => {
        proposal = { id: 'proposal-1', name: 'create_booking', arguments: { serviceId: args.serviceId, durationMinutes: args.durationMinutes, startAt: args.startAt }, confirmationText: args.confirmationText, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
        return proposal;
      }),
      getConversation: vi.fn(async () => ({ clientId: 'alice', pendingAction: consumed ? undefined : proposal })),
      listMessages: vi.fn(async () => delivered ? [{ role: 'assistant', content: proposal!.confirmationText }, ...(superseded ? [{ role: 'assistant', content: 'Маю інший час.' }] : [])] : []),
      consumeAssistantBooking: vi.fn(async () => { consumed = true; return proposal; }),
    };
    const booking = { id: 'created', clientId: 'alice', telegramChatId: 'chat' };
    const bookingService = { create: vi.fn(async () => booking) };
    const evidence = { read: vi.fn(async () => ({ schedule: { status: 'ready' }, calendar: { status: 'ready', rangeStart: new Date().toISOString(), rangeEnd: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(), busy: [] } })) };
    const subject = new AssistantToolsService(repository as never, bookingService as never, evidence as never);
    const prepared = await subject.execute({ name: 'prepare_booking', arguments: { serviceId: 'massage', durationMinutes: 60, startAt } }, context);
    expect(prepared).toMatchObject({ status: 'prepared', confirmationText: expect.stringContaining('Massage') });
    expect(repository.stageAssistantBooking).toHaveBeenCalledWith('chat', 'alice', expect.objectContaining({ startAt: normalizedStartAt }));
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, { ...context, currentMessage: 'Так, підтверджую' })).rejects.toThrow('not delivered');
    delivered = true;
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, { ...context, currentMessage: 'Так, але на годину пізніше' })).rejects.toThrow('Explicit client confirmation');
    superseded = true;
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, { ...context, currentMessage: 'Так' })).rejects.toThrow('not delivered');
    superseded = false;
    expect(bookingService.create).not.toHaveBeenCalled();
    expect(await subject.execute({ name: 'create_booking', arguments: {} }, { ...context, currentMessage: 'Так, все підходить' })).toEqual({ status: 'created', booking });
    expect(bookingService.create).toHaveBeenCalledWith({ serviceId: 'massage', durationMinutes: 60, startAt: normalizedStartAt, clientId: 'alice', telegramChatId: 'chat' });
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, { ...context, currentMessage: 'Так' })).rejects.toThrow('Valid booking proposal');
    expect(bookingService.create).toHaveBeenCalledTimes(1);
  });
});
