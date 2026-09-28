import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookingRepository } from '../src/repository.js';
import type { HumanAssistanceStore } from '../src/human-assistance.store.js';
import { HumanAssistanceService } from '../src/human-assistance.service.js';

const setup = (thresholdPercent = 60) => {
  const store = { settings: vi.fn(async () => ({ thresholdPercent, usernames: [] })), connected: vi.fn(async () => []), queue: vi.fn(async () => true), open: vi.fn(), setDelivery: vi.fn(), get: vi.fn(), claimAnswer: vi.fn(), completeAnswer: vi.fn() };
  const repository = { getKnowledgeBaseOverride: vi.fn(async () => ({ content: 'Open 10:00–20:00', updatedAt: '2026-09-25T10:00:00.000Z' })), listServices: vi.fn(async () => [{ id: 'massage-60', name: 'Massage', description: 'Classic', durationMinutes: 60, price: 1500, currency: 'UAH', enabled: true }]), listMessages: vi.fn(async () => [{ role: 'user' as const, content: 'Earlier question' }]), appendMessage: vi.fn() };
  const debug = { record: vi.fn(async () => {}) };
  const selector = { estimateProbability: vi.fn(async () => 0.5) };
  return { selector, service: new HumanAssistanceService(store as unknown as HumanAssistanceStore, repository as unknown as BookingRepository, debug as never, selector as never), store, repository, debug };
};
const request = { id: 'case-1', conversationId: '123', telegramChatId: '123', telegramUpdateId: 1, businessConnectionId: 'business-1', status: 'open', reason: 'knowledge_gap', probability: 0.7, thresholdPercent: 60, question: 'Unknown?', queuedMessages: [], notifications: {}, acknowledgement: 'sent', createdAt: '2026-09-25T10:00:00.000Z', updatedAt: '2026-09-25T10:00:00.000Z' } as const;
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('human reply delivery', () => {
  it('claims once and sends through the original Business connection', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal('fetch', fetcher);
    const { service, store, repository, selector } = setup();
    store.get.mockResolvedValue(request as never);
    store.claimAnswer.mockResolvedValue('lease-1' as never);
    store.completeAnswer.mockResolvedValue(true as never);
    await service.reply('case-1', ' Human answer ', 'telegram:42');
    expect(selector.estimateProbability).not.toHaveBeenCalled();
    expect(store.claimAnswer).toHaveBeenCalledWith('case-1', 'telegram:42');
    expect(store.completeAnswer).toHaveBeenCalledWith('case-1', 'lease-1', 'answered', 'Human answer');
    expect(repository.appendMessage).toHaveBeenCalledWith('123', 'human', 'Human answer');
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body)).toEqual({ chat_id: '123', business_connection_id: 'business-1', text: 'Human answer' });
  });
  it('keeps explicit rejection open and uncertain transport paused', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const { service, store, repository } = setup();
    store.get.mockResolvedValue(request as never);
    store.claimAnswer.mockResolvedValue('lease-1' as never);
    const fetcher = vi.fn(async () => ({ ok: false, json: async () => ({ ok: false }) }));
    vi.stubGlobal('fetch', fetcher);
    await expect(service.reply('case-1', 'Human answer', 'telegram:42')).rejects.toThrow('Telegram rejected');
    expect(store.completeAnswer).toHaveBeenCalledWith('case-1', 'lease-1', 'open');
    fetcher.mockImplementationOnce(async () => { throw new Error('timeout'); });
    await expect(service.reply('case-1', 'Human answer', 'telegram:42')).rejects.toThrow('uncertain');
    expect(store.completeAnswer).toHaveBeenLastCalledWith('case-1', 'lease-1', 'uncertain');
    expect(repository.appendMessage).not.toHaveBeenCalled();
  });
  it('sends only the winning claimed reply', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal('fetch', fetcher);
    const { service, store } = setup();
    store.get.mockResolvedValue(request as never);
    store.claimAnswer.mockResolvedValueOnce('lease-1' as never).mockResolvedValueOnce(undefined as never);
    store.completeAnswer.mockResolvedValue(true as never);
    const results = await Promise.allSettled([service.reply('case-1', 'First', 'telegram:1'), service.reply('case-1', 'Second', 'telegram:2')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

it('sends operational failures to configured verified responders', async () => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  const { service, store } = setup(100);
  store.open.mockResolvedValue({ request, created: true });
  store.connected.mockResolvedValue([{ userId: '42', chatId: '42', username: 'responsible' }] as never);
  const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/getChat') ? { ok: true, result: { id: 42, type: 'private', username: 'responsible' } } : { ok: true } }));
  vi.stubGlobal('fetch', fetcher);
  await service.escalateError('123', 'business-1', 777, '/confirm', 'Booking safe-id has an uncertain Calendar outcome.');
  expect(store.open).toHaveBeenCalledWith('123', 'business-1', 777, expect.stringContaining('safe-id'), 'operation_error', undefined, 100);
  const deliveries = fetcher.mock.calls.filter(([url]) => url.endsWith('/sendMessage'));
  expect(deliveries).toHaveLength(1);
  expect(JSON.parse(deliveries[0]![1]!.body as string)).toMatchObject({ chat_id: '42', text: expect.stringContaining('safe-id') });
  expect(JSON.parse(deliveries[0]![1]!.body as string)).not.toHaveProperty('business_connection_id');
  expect(store.setDelivery).toHaveBeenCalledWith('case-1', '42:initial', 'sent');
  expect(store.setDelivery.mock.calls.every(([, recipient]) => recipient !== undefined)).toBe(true);
  expect(fetcher.mock.calls.every(([url]) => !String(url).includes('/v1/decisions'))).toBe(true);
});

it('keeps an open case without sending a client message when no responder is connected', async () => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  const { service, store, debug } = setup();
  store.open.mockResolvedValue({ request, created: true });
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await service.escalate('123', 'business-1', 778, 'Unknown?', { reason: 'knowledge_gap', thresholdPercent: 60 });
  expect(store.open).toHaveBeenCalledOnce();
  expect(store.setDelivery).not.toHaveBeenCalled();
  expect(debug.record).toHaveBeenCalledWith(expect.any(Object), 'handoff', expect.objectContaining({ reason: 'no_connected_responders', responderCount: 0 }), 'warn');
  expect(fetcher).not.toHaveBeenCalled();
});


describe('outgoing Probability gate', () => {
  it.each([[0.5, 60, true], [0.6, 60, true], [0.61, 60, false], [0, 0, true], [0.01, 0, false], [1, 100, true]] as const)('checks %s against %s with strict boundary', async (probability, threshold, allowed) => {
    const { service, selector, store } = setup(threshold);
    selector.estimateProbability.mockResolvedValue(probability);
    store.open.mockResolvedValue({ request, created: true });
    expect(await service.approveOutgoing('123', 'business-1', 1, 'Question', 'Draft')).toBe(allowed);
    if (allowed) expect(store.open).not.toHaveBeenCalled();
    else expect(store.open).toHaveBeenCalledWith('123', 'business-1', 1, expect.stringContaining('Unsent draft: Draft'), 'bot_detectability', probability, threshold);
  });

  it('uses the latest 20 messages and exact formatted draft separately', async () => {
    const { service, repository, selector } = setup();
    repository.listMessages.mockResolvedValue(Array.from({ length: 25 }, (_, index) => ({ role: 'user' as const, content: `message ${index}` })));
    await service.approveOutgoing('123', undefined, 1, 'message 24', '<b>Exact draft</b>');
    const [input] = selector.estimateProbability.mock.calls[0]! as unknown as [{ question: string; context: string }];
    const context = JSON.parse(input.context);
    expect(context.recent_messages).toHaveLength(20);
    expect(context.recent_messages[0].content).toBe('message 5');
    expect(context.recent_messages.at(-1).content).toBe('message 24');
    expect(context.proposed_reply).toBe('<b>Exact draft</b>');
    expect(input.question).toContain('automated');
  });

  it.each([NaN, -0.1, 1.1, '0.5', null])('withholds invalid score %s', async (value) => {
    const { service, selector, store } = setup();
    selector.estimateProbability.mockResolvedValue(value as number);
    store.open.mockResolvedValue({ request, created: true });
    expect(await service.approveOutgoing('123', undefined, 1, 'Question', 'Draft')).toBe(false);
    expect(store.open).toHaveBeenCalledWith('123', undefined, 1, expect.any(String), 'probability_unavailable', undefined, 60);
  });

  it('withholds provider failures and oversized context', async () => {
    const { service, selector, store, repository } = setup();
    store.open.mockResolvedValue({ request, created: true });
    selector.estimateProbability.mockRejectedValueOnce(new Error('provider failed'));
    expect(await service.approveOutgoing('123', undefined, 1, 'Question', 'Draft')).toBe(false);
    selector.estimateProbability.mockClear();
    repository.listMessages.mockResolvedValue([{ role: 'user', content: 'x'.repeat(100_001) }]);
    expect(await service.approveOutgoing('123', undefined, 2, 'Question', 'Draft')).toBe(false);
    expect(selector.estimateProbability).not.toHaveBeenCalled();
  });
});

it.each([true, false])('includes a client link when available: %s', async (available) => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  const { service, store } = setup();
  store.open.mockResolvedValue({ request, created: true });
  store.connected.mockResolvedValue([{ userId: '42', chatId: '42', username: 'responsible' }] as never);
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string);
    return { ok: true, json: async () => url.endsWith('/getChat') ? { ok: true, result: { id: body.chat_id, type: 'private', username: body.chat_id === '42' ? 'responsible' : available ? 'client123' : undefined } } : { ok: true } };
  });
  vi.stubGlobal('fetch', fetcher);
  await service.escalate('123', 'business-1', 1, 'Question', { reason: 'bot_detectability', probability: 0.9, thresholdPercent: 60 });
  const delivery = fetcher.mock.calls.find(([url]) => url.endsWith('/sendMessage'))!;
  const text = JSON.parse(delivery[1]!.body as string).text;
  expect(text).toContain('123');
  if (available) expect(text).toContain('https://t.me/client123');
  else expect(text).not.toContain('https://t.me/');
  expect(text.length).toBeLessThanOrEqual(4096);
});


it('still sends queued assistance when client chat lookup fails', async () => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  const { service, store } = setup();
  store.get.mockResolvedValue(request as never);
  store.connected.mockResolvedValue([{ userId: '42', chatId: '42', username: 'responsible' }] as never);
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string);
    if (url.endsWith('/getChat') && body.chat_id === '123') return { ok: true, json: async () => { throw new Error('invalid response'); } };
    return { ok: true, json: async () => url.endsWith('/getChat') ? { ok: true, result: { id: 42, type: 'private', username: 'responsible' } } : { ok: true } };
  });
  vi.stubGlobal('fetch', fetcher);
  await service.queueExisting('case-1', 'Follow-up question', 999);
  const delivery = fetcher.mock.calls.find(([url]) => url.endsWith('/sendMessage'))!;
  expect(JSON.parse(delivery[1]!.body as string).text).toContain('Чат клієнта: 123');
  expect(JSON.parse(delivery[1]!.body as string).text).toContain('Follow-up question');
  expect(store.setDelivery).toHaveBeenCalledWith('case-1', '42:999', 'sent');
});
