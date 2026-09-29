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
  it('creates only the delivered, fact-checked proposal selected by the assistant', async () => {
    const utcStart = new Date(Math.ceil((Date.now() + 24 * 60 * 60_000) / 1000) * 1000);
    const startAt = `${new Date(utcStart.getTime() + 3 * 60 * 60_000).toISOString().slice(0, 19)}+03:00`;
    const normalizedStartAt = utcStart.toISOString();
    const proposalId = '2a1c75d0-d891-4e04-8b54-341cba762ae6';
    const service = { id: 'massage', name: 'Massage', durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH', enabled: true };
    let proposal: { id: string; name: 'create_booking'; arguments: { serviceId: string; durationMinutes: number; startAt: string }; confirmationFacts: { serviceName: string; durationMinutes: number; localDate: string; localTime: string; price: number; currency: string; referenceCode?: string }; expiresAt: string } | undefined;
    let delivered = false;
    let omitCurrency = false;
    let superseded = false;
    let deliveredProposalId: string | undefined;
    let consumed = false;
    const repository = {
      getService: vi.fn(async () => service),
      stageAssistantBooking: vi.fn(async (_chat: string, _client: string, args: { serviceId: string; durationMinutes: number; startAt: string; confirmationFacts: NonNullable<typeof proposal>['confirmationFacts'] }) => {
        proposal = { id: proposalId, name: 'create_booking', arguments: { serviceId: args.serviceId, durationMinutes: args.durationMinutes, startAt: args.startAt }, confirmationFacts: args.confirmationFacts, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
        return proposal;
      }),
      getConversation: vi.fn(async () => ({ clientId: 'alice', pendingAction: consumed ? undefined : proposal })),
      listMessagesForBookingCheck: vi.fn(async () => delivered ? [{ role: 'assistant' as const, content: `${proposal!.confirmationFacts.serviceName}, ${proposal!.confirmationFacts.durationMinutes} хв, ${proposal!.confirmationFacts.localDate} о ${proposal!.confirmationFacts.localTime}, ${proposal!.confirmationFacts.price}${omitCurrency ? '' : ` ${proposal!.confirmationFacts.currency}`}. Підтверджуєте?`, ...(deliveredProposalId ? { bookingProposalId: deliveredProposalId } : {}) }, ...(superseded ? [{ role: 'assistant' as const, content: 'Маю інший час.' }] : [])] : []),
      consumeAssistantBooking: vi.fn(async () => { consumed = true; return proposal; }),
    };
    const booking = { id: 'created', clientId: 'alice', telegramChatId: 'chat' };
    const bookingService = { create: vi.fn(async () => booking) };
    const evidence = { read: vi.fn(async () => ({ schedule: { status: 'ready' }, calendar: { status: 'ready', rangeStart: new Date().toISOString(), rangeEnd: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(), busy: [] } })) };
    const subject = new AssistantToolsService(repository as never, bookingService as never, evidence as never);
    const prepared = await subject.execute({ name: 'prepare_booking', arguments: { serviceId: 'massage', durationMinutes: 60, startAt } }, context);
    expect(prepared).toMatchObject({ status: 'prepared', proposalId, confirmationFacts: { serviceName: 'Massage', durationMinutes: 60, price: 1500, currency: 'UAH' } });
    expect((prepared as { confirmationFacts: object }).confirmationFacts).not.toHaveProperty('referenceCode');
    expect(repository.stageAssistantBooking).toHaveBeenCalledWith('chat', 'alice', expect.objectContaining({ startAt: normalizedStartAt, confirmationFacts: expect.any(Object) }));
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, context)).rejects.toThrow('not delivered');
    delivered = true;
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, context)).rejects.toThrow('not delivered');
    deliveredProposalId = 'different-proposal';
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, context)).rejects.toThrow('not delivered');
    deliveredProposalId = proposalId;
    omitCurrency = true;
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, context)).rejects.toThrow('not delivered accurately');
    omitCurrency = false;
    superseded = true;
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, context)).rejects.toThrow('not delivered');
    superseded = false;
    expect(bookingService.create).not.toHaveBeenCalled();
    expect(await subject.execute({ name: 'create_booking', arguments: {} }, context)).toEqual({ status: 'created', booking });
    expect(bookingService.create).toHaveBeenCalledWith({ serviceId: 'massage', durationMinutes: 60, startAt: normalizedStartAt, clientId: 'alice', telegramChatId: 'chat' });
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, context)).rejects.toThrow('Valid booking proposal');
    expect(bookingService.create).toHaveBeenCalledTimes(1);
  });

  it('keeps legacy reference-code proposals verifiable without message binding metadata', async () => {
    const proposal = { id: '3a1c75d0-d891-4e04-8b54-341cba762ae6', name: 'create_booking' as const, arguments: { serviceId: 'massage', durationMinutes: 60, startAt: '2026-09-30T17:00:00.000Z' }, confirmationFacts: { serviceName: 'Massage', durationMinutes: 60, localDate: '30 вер. 2026 р.', localTime: '20:00', price: 1500, currency: 'UAH', referenceCode: 'f6b473a6' }, expiresAt: new Date(Date.now() + 60_000).toISOString() };
    let deliveredProposalId: string | undefined = 'different-proposal';
    const repository = {
      getConversation: vi.fn(async () => ({ clientId: 'alice', pendingAction: proposal })),
      listMessagesForBookingCheck: vi.fn(async () => [{ role: 'assistant' as const, content: 'Massage, 60 хв, 30 вер. 2026 р. о 20:00, 1500 UAH. Код f6b473a6.', ...(deliveredProposalId ? { bookingProposalId: deliveredProposalId } : {}) }]),
      consumeAssistantBooking: vi.fn(async () => proposal),
    };
    const booking = { id: 'legacy-created', clientId: 'alice', telegramChatId: 'chat' };
    const bookingService = { create: vi.fn(async () => booking) };
    const subject = new AssistantToolsService(repository as never, bookingService as never, {} as never);
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, context)).rejects.toThrow('not delivered accurately');
    deliveredProposalId = undefined;
    expect(await subject.execute({ name: 'create_booking', arguments: {} }, context)).toEqual({ status: 'created', booking });
  });
});
