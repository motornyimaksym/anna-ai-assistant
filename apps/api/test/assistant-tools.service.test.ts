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
    let clarified = false;
    let deliveredProposalId: string | undefined;
    let consumed = false;
    const repository = {
      getService: vi.fn(async () => service),
      stageAssistantBooking: vi.fn(async (_chat: string, _client: string, args: { serviceId: string; durationMinutes: number; startAt: string; confirmationFacts: NonNullable<typeof proposal>['confirmationFacts'] }) => {
        proposal = { id: proposalId, name: 'create_booking', arguments: { serviceId: args.serviceId, durationMinutes: args.durationMinutes, startAt: args.startAt }, confirmationFacts: args.confirmationFacts, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
        return proposal;
      }),
      getConversation: vi.fn(async () => ({ clientId: 'alice', pendingAction: consumed ? undefined : proposal })),
      listMessagesForBookingCheck: vi.fn(async () => delivered ? [{ role: 'assistant' as const, content: `${proposal!.confirmationFacts.serviceName}, ${proposal!.confirmationFacts.durationMinutes} хв, ${proposal!.confirmationFacts.localDate} о ${proposal!.confirmationFacts.localTime}, ${proposal!.confirmationFacts.price}${omitCurrency ? '' : ` ${proposal!.confirmationFacts.currency}`}. Підтверджуєте?`, ...(deliveredProposalId ? { bookingProposalId: deliveredProposalId } : {}) }, ...(clarified ? [{ role: 'user' as const, content: 'Це ж не салон?' }, { role: 'assistant' as const, content: 'Приймаю у власному просторі, це не салон.' }] : [])] : []),
      consumeAssistantBooking: vi.fn(async () => { consumed = true; return proposal; }),
    };
    const booking = { id: 'created', clientId: 'alice', telegramChatId: 'chat' };
    const bookingService = { create: vi.fn(async (..._args: unknown[]) => booking) };
    const evidence = { read: vi.fn(async () => ({ schedule: { status: 'ready' }, calendar: { status: 'ready', rangeStart: new Date().toISOString(), rangeEnd: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(), busy: [] } })) };
    const subject = new AssistantToolsService(repository as never, bookingService as never, evidence as never);
    const prepared = await subject.execute({ name: 'prepare_booking', arguments: { serviceId: 'massage', durationMinutes: 60, startAt } }, context);
    expect(prepared).toMatchObject({ status: 'prepared', proposalId, confirmationFacts: { serviceName: 'Massage', durationMinutes: 60, price: 1500, currency: 'UAH' } });
    expect((prepared as { confirmationFacts: object }).confirmationFacts).not.toHaveProperty('referenceCode');
    expect(repository.stageAssistantBooking).toHaveBeenCalledWith('chat', 'alice', expect.objectContaining({ startAt: normalizedStartAt, confirmationFacts: expect.any(Object) }));
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, context)).rejects.toMatchObject({ code: 'BOOKING_PROPOSAL_STATE', proposalIssue: 'undelivered' });
    delivered = true;
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, context)).rejects.toThrow('not delivered');
    deliveredProposalId = 'different-proposal';
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, context)).rejects.toThrow('not delivered');
    deliveredProposalId = proposalId;
    omitCurrency = true;
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, context)).rejects.toMatchObject({ code: 'BOOKING_PROPOSAL_FACT_MISMATCH', factIssues: ['currency'] });
    omitCurrency = false;
    clarified = true;
    expect(bookingService.create).not.toHaveBeenCalled();
    const bookingTurnContext = { ...context, currentMessage: 'Підходить', telegramUsername: 'user61785', telegramDisplayName: 'Іван Петренко' };
    expect(await subject.execute({ name: 'create_booking', arguments: {} }, bookingTurnContext)).toEqual({ status: 'created', booking });
    expect(bookingService.create).toHaveBeenCalledWith(
      { serviceId: 'massage', durationMinutes: 60, startAt: normalizedStartAt, clientId: 'alice', telegramChatId: 'chat' },
      expect.objectContaining({
        telegramUsername: 'user61785',
        telegramDisplayName: 'Іван Петренко',
        messages: [expect.objectContaining({ role: 'assistant' }), expect.objectContaining({ role: 'user' }), expect.objectContaining({ role: 'assistant' }), { role: 'user', content: expect.any(String) }],
      }),
    );
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, context)).rejects.toMatchObject({ code: 'BOOKING_PROPOSAL_STATE', proposalIssue: 'missing' });
    expect(bookingService.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['expired', { clientId: 'alice', pendingAction: { id: 'expired', name: 'create_booking', confirmationFacts: { serviceName: 'Massage', durationMinutes: 60, localDate: '30 вер. 2026 р.', localTime: '20:00', price: 1500, currency: 'UAH' }, expiresAt: '2000-01-01T00:00:00.000Z' } }, 'expired'],
    ['client mismatch', { clientId: 'bob', pendingAction: { id: 'valid', name: 'create_booking', confirmationFacts: { serviceName: 'Massage', durationMinutes: 60, localDate: '30 вер. 2026 р.', localTime: '20:00', price: 1500, currency: 'UAH' }, expiresAt: '2099-01-01T00:00:00.000Z' } }, 'client_mismatch'],
    ['factless legacy proposal', { clientId: 'alice', pendingAction: { id: 'legacy', name: 'create_booking', confirmationText: 'Massage at 20:00?', expiresAt: '2099-01-01T00:00:00.000Z' } }, 'incomplete'],
  ])('identifies a safe proposal state issue: %s', async (_label, conversation, proposalIssue) => {
    const repository = { getConversation: vi.fn(async () => conversation) };
    const subject = new AssistantToolsService(repository as never, { create: vi.fn() } as never, {} as never);
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, context)).rejects.toMatchObject({ code: 'BOOKING_PROPOSAL_STATE', proposalIssue });
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
    const approvalContext = { ...context, currentMessage: 'Так, підтверджую' };
    await expect(subject.execute({ name: 'create_booking', arguments: {} }, approvalContext)).rejects.toThrow('not delivered accurately');
    deliveredProposalId = undefined;
    expect(await subject.execute({ name: 'create_booking', arguments: {} }, approvalContext)).toEqual({ status: 'created', booking });
  });
});

it.each([undefined, { enabled: false }])('rejects an unavailable service before evidence reads or writes', async (service) => {
  const repository = { getService: vi.fn(async () => service), stageAssistantBooking: vi.fn() };
  const evidence = { read: vi.fn() };
  const bookings = { create: vi.fn() };
  const subject = new AssistantToolsService(repository as never, bookings as never, evidence as never);
  await expect(subject.execute({ name: 'prepare_booking', arguments: { serviceId: 'invented-id', durationMinutes: 90, startAt: '2099-01-01T18:30:00+03:00' } }, context)).rejects.toMatchObject({ code: 'BOOKING_SERVICE_UNAVAILABLE' });
  expect(evidence.read).not.toHaveBeenCalled();
  expect(repository.stageAssistantBooking).not.toHaveBeenCalled();
  expect(bookings.create).not.toHaveBeenCalled();
});

it.each([
  ['BOOKING_DURATION_UNAVAILABLE', 'duration'],
  ['BOOKING_SCHEDULE_UNAVAILABLE', 'schedule'],
  ['BOOKING_CALENDAR_UNAVAILABLE', 'calendar'],
  ['BOOKING_TIME_INVALID', 'past'],
  ['BOOKING_RANGE_UNAVAILABLE', 'range'],
  ['BOOKING_TIME_BUSY', 'busy'],
])('reports %s before staging or writing', async (code, failure) => {
  const start = Date.now() + (failure === 'past' ? -1 : 1) * 86400_000;
  const repository = {
    getService: vi.fn(async () => ({ id: 'massage', name: 'Massage', enabled: true, durationMinutes: 90, price: 4000, currency: 'UAH', bufferMinutes: 15 })),
    stageAssistantBooking: vi.fn(),
  };
  const calendar = { status: failure === 'calendar' ? 'unavailable' : 'ready', rangeStart: new Date(Date.now() - 2 * 86400_000).toISOString(), rangeEnd: new Date(failure === 'range' ? start + 60_000 : start + 86400_000).toISOString(), busy: failure === 'busy' ? [{ start: new Date(start + 95 * 60_000).toISOString(), end: new Date(start + 120 * 60_000).toISOString() }] : [] };
  const evidence = { read: vi.fn(async () => ({ schedule: { status: failure === 'schedule' ? 'unavailable' : 'ready' }, calendar })) };
  const bookings = { create: vi.fn() };
  const subject = new AssistantToolsService(repository as never, bookings as never, evidence as never);
  await expect(subject.execute({ name: 'prepare_booking', arguments: { serviceId: 'massage', durationMinutes: failure === 'duration' ? 75 : 90, startAt: new Date(start).toISOString() } }, context)).rejects.toMatchObject({ code });
  expect(repository.stageAssistantBooking).not.toHaveBeenCalled();
  expect(bookings.create).not.toHaveBeenCalled();
});
