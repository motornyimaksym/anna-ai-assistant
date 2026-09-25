import type { AssistantReply, OpenAiService } from '../src/openai.service.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookingRepository } from '../src/repository.js';
import { TelegramService } from '../src/telegram.service.js';
import type { HumanAssistanceService } from '../src/human-assistance.service.js';

const update = (username?: string) => ({
  update_id: 101,
  business_message: {
    message_id: 9,
    chat: { id: 123 },
    from: { id: 456, ...(username ? { username } : {}) },
    text: 'Hello',
    business_connection_id: 'connection-1',
  },
});

const setup = (settings = { maxReadDelayMs: 0, typingDelayPerSymbolMs: 600, updatedAt: '2026-09-24T10:00:00.000Z' }) => {
  const order: string[] = [];
  const repository = {
    appendMessage: vi.fn(),
    claimTelegramUpdate: vi.fn(async () => true),
    getConversation: vi.fn(async () => undefined),
    getBotSettingsOverride: vi.fn(async () => settings),
    saveConversation: vi.fn(async (conversation: unknown) => conversation),
  };
  const send = vi.fn(async (url: string, _init?: RequestInit) => { order.push(url.split('/').at(-1)!); return { ok: true, json: async () => ({ ok: true }) }; });
  vi.stubGlobal('fetch', send);
  const assistant = { respond: vi.fn(async (): Promise<AssistantReply> => { order.push('assistant'); return { text: 'OK', fromOpenAI: true }; }) };
  const human = { decide: vi.fn(async () => ({ route: 'openai' as const })), isConfiguredUsername: vi.fn(async () => false), authorizedResponder: vi.fn(async () => undefined), enroll: vi.fn(async () => true), send: vi.fn(), reply: vi.fn(), queueExisting: vi.fn(), escalate: vi.fn() };
  const scheduleImport = { syncIfDue: vi.fn(async () => undefined) };
  return { service: new TelegramService(repository as unknown as BookingRepository, assistant as unknown as OpenAiService, human as unknown as HumanAssistanceService, scheduleImport as never), repository, send, assistant, human, scheduleImport, order };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Telegram private test restriction', () => {
  it('checks for schedule refresh on each incoming message and tolerates refresh failure', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
    vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
    const { service, scheduleImport } = setup();
    scheduleImport.syncIfDue.mockRejectedValueOnce(new Error('import unavailable'));

    await expect(service.handle('webhook-secret', update('other'))).resolves.toBeUndefined();
    await service.handle('webhook-secret', { ...update('other'), update_id: 102 });

    expect(scheduleImport.syncIfDue).toHaveBeenCalledTimes(2);
  });

  it('ignores other senders and missing usernames before claiming their updates', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
    vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
    const { service, repository, send, assistant } = setup();

    await service.handle('webhook-secret', update('anotheruser'));
    await service.handle('webhook-secret', update());

    expect(repository.claimTelegramUpdate).not.toHaveBeenCalled();
    expect(repository.saveConversation).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(assistant.respond).not.toHaveBeenCalled();
  });

  it('fails closed when no allowed username is configured', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
    vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', undefined);
    const { service, repository, send, assistant } = setup();

    await service.handle('webhook-secret', update('user61785'));

    expect(repository.claimTelegramUpdate).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(assistant.respond).not.toHaveBeenCalled();
  });

  it('replies only to the allowed username, ignoring case', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-bot-token');
    vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
    const { service, repository, send, assistant, order } = setup();

    vi.useFakeTimers();
    const handling = service.handle('webhook-secret', update('User61785'));
    await vi.advanceTimersByTimeAsync(2_000);
    await handling;

    expect(repository.claimTelegramUpdate).toHaveBeenCalledWith(101);
    expect(repository.saveConversation).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledTimes(3);
    expect(assistant.respond).toHaveBeenCalledOnce();
    expect(order.slice(0, 3)).toEqual(['readBusinessMessage', 'sendChatAction', 'assistant']);
    expect(JSON.parse(send.mock.calls[0]![1]!.body as string)).toEqual({ business_connection_id: 'connection-1', chat_id: 123, message_id: 9 });
    expect(JSON.parse(send.mock.calls[1]![1]!.body as string)).toMatchObject({ chat_id: '123', business_connection_id: 'connection-1', action: 'typing' });
    expect(send.mock.calls[2]![0]).toContain('/sendMessage');
    expect(JSON.parse(send.mock.calls[2]![1]!.body as string)).toMatchObject({ parse_mode: 'HTML', text: 'OK' });
  });
});

it('supports allowed private DMs but ignores groups and duplicate updates', async () => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
  const { service, repository, assistant, send } = setup();
  const message = { ...update('user61785').business_message, chat: { id: 123, type: 'group' } };
  await service.handle('webhook-secret', { update_id: 1, message });
  expect(assistant.respond).not.toHaveBeenCalled();
  message.chat.type = 'private';
  vi.useFakeTimers();
  const handling = service.handle('webhook-secret', { update_id: 2, message });
  await vi.advanceTimersByTimeAsync(2_000);
  await handling;
  expect(assistant.respond).toHaveBeenCalledOnce();
  expect(send.mock.calls.some(([url]) => url.includes('/readBusinessMessage'))).toBe(false);
  repository.claimTelegramUpdate.mockResolvedValueOnce(false);
  await service.handle('webhook-secret', { update_id: 2, message });
  expect(assistant.respond).toHaveBeenCalledOnce();
});

it('continues replying when Telegram rejects the business read receipt', async () => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
  const { service, send, assistant } = setup();
  send.mockImplementationOnce(async () => { throw new Error('Telegram unavailable'); });
  assistant.respond.mockResolvedValue({ text: 'OK', fromOpenAI: false });

  await service.handle('webhook-secret', update('user61785'));

  expect(send).toHaveBeenCalledTimes(3);
  expect(send.mock.calls[0]![0]).toContain('/readBusinessMessage');
  expect(send.mock.calls[2]![0]).toContain('/sendMessage');
  expect(JSON.parse(send.mock.calls[2]![1]!.body as string)).not.toHaveProperty('parse_mode');
  expect(assistant.respond).toHaveBeenCalledOnce();
});

it('refreshes typing while OpenAI is processing and stops when it finishes', async () => {
  vi.useFakeTimers();
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
  const { service, send, assistant } = setup();
  let finish!: (answer: { text: string; fromOpenAI: boolean }) => void;
  let started!: () => void;
  const processing = new Promise<{ text: string; fromOpenAI: boolean }>((resolve) => { finish = resolve; });
  const called = new Promise<void>((resolve) => { started = resolve; });
  assistant.respond.mockImplementation(() => { started(); return processing; });

  const handling = service.handle('webhook-secret', update('user61785'));
  await called;
  expect(send).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(4_000);
  expect(send).toHaveBeenCalledTimes(3);
  finish({ text: 'OK', fromOpenAI: true });
  await vi.advanceTimersByTimeAsync(1_199);
  expect(send).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(1);
  await handling;
  expect(send).toHaveBeenCalledTimes(4);
  expect(send.mock.calls[3]![0]).toContain('/sendMessage');
  vi.useRealTimers();
});

it('does not pace non-OpenAI control responses', async () => {
  vi.useFakeTimers();
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
  const { service, send, assistant } = setup();
  assistant.respond.mockResolvedValue({ text: 'Control response', fromOpenAI: false });
  await service.handle('webhook-secret', update('user61785'));
  expect(send.mock.calls.at(-1)![0]).toContain('/sendMessage');
});

it('waits a random inclusive delay before marking an eligible business message as read', async () => {
  vi.useFakeTimers();
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
  vi.spyOn(Math, 'random').mockReturnValue(0.999999);
  const { service, send, assistant, order } = setup({ maxReadDelayMs: 1000, typingDelayPerSymbolMs: 0, updatedAt: '2026-09-24T10:00:00.000Z' });
  assistant.respond.mockResolvedValue({ text: 'OK', fromOpenAI: false });

  const handling = service.handle('webhook-secret', update('user61785'));
  await vi.advanceTimersByTimeAsync(999);
  expect(send).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await handling;

  expect(order[0]).toBe('readBusinessMessage');
  expect(send.mock.calls[0]![0]).toContain('/readBusinessMessage');
});

it('uses the configured typing delay per symbol for OpenAI answers', async () => {
  vi.useFakeTimers();
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
  const { service, send, assistant } = setup({ maxReadDelayMs: 1000, typingDelayPerSymbolMs: 5, updatedAt: '2026-09-24T10:00:00.000Z' });
  assistant.respond.mockResolvedValue({ text: 'Hey!', fromOpenAI: true });
  const dm = { update_id: 303, message: { ...update('user61785').business_message, business_connection_id: undefined, chat: { id: 123, type: 'private' } } };

  const handling = service.handle('webhook-secret', dm);
  await vi.advanceTimersByTimeAsync(19);
  expect(send.mock.calls.some(([url]) => url.includes('/sendMessage'))).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await handling;
  expect(send.mock.calls.some(([url]) => url.includes('/sendMessage'))).toBe(true);
});

it('does not automatically send legacy service photos or captions', async () => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
  const { service, send, assistant, order } = setup();
  assistant.respond.mockResolvedValue({
    text: 'Here are the services.', fromOpenAI: false,
    serviceCards: [{ id: 'massage', name: 'Massage', description: 'Relaxing massage', durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH', enabled: true, photoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/massage.jpg?token=x', telegramCaption: { text: 'Classic massage', entities: [{ type: 'bold', offset: 0, length: 7 }] }, telegramButtons: [[{ text: 'Book', url: 'https://example.com/book' }]] }],
  });
  const dm = { update_id: 404, message: { ...update('user61785').business_message, business_connection_id: undefined, chat: { id: 123, type: 'private' } } };

  await service.handle('webhook-secret', dm);

  const photoCall = send.mock.calls.find(([url]) => url.includes('/sendPhoto'));
  expect(order).toEqual(['sendChatAction', 'sendMessage']);
  expect(JSON.parse(send.mock.calls[1]![1]!.body as string)).toMatchObject({ text: 'Here are the services.' });
  expect(photoCall).toBeUndefined();
});

it('does not automatically send legacy text service cards', async () => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
  const { service, send, assistant } = setup();
  const services = ['First', 'Second'].map((name, index) => ({ id: `massage-${index}`, name, description: 'Massage', durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH', enabled: true }));
  assistant.respond.mockResolvedValue({ text: 'Here are the services.', fromOpenAI: false, serviceCards: services });
  send.mockImplementation(async (_url, init) => {
    const body = JSON.parse(init?.body as string) as { text?: string };
    return body.text?.startsWith('First') ? { ok: false, json: async () => ({ ok: false }) } : { ok: true, json: async () => ({ ok: true }) };
  });
  const dm = { update_id: 405, message: { ...update('user61785').business_message, business_connection_id: undefined, chat: { id: 123, type: 'private' } } };

  await service.handle('webhook-secret', dm);

  expect(send.mock.calls.some(([, init]) => (JSON.parse(init?.body as string) as { text?: string }).text?.startsWith('Second'))).toBe(false);
});

it('routes high Jev scores to a human without typing or calling OpenAI', async () => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
  const { service, human, assistant, repository, send } = setup();
  human.decide.mockResolvedValueOnce({ route: 'human', reason: 'knowledge_gap', probability: 0.7, thresholdPercent: 60 } as never);
  await service.handle('webhook-secret', { update_id: 600, message: { ...update('user61785').business_message, chat: { id: 123, type: 'private' } } });
  expect(human.escalate).toHaveBeenCalledWith('123', 'connection-1', 600, 'Hello', expect.objectContaining({ reason: 'knowledge_gap' }));
  expect(repository.appendMessage).toHaveBeenCalledWith('123', 'user', 'Hello');
  expect(assistant.respond).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it('continues with OpenAI and creates no human case when Jev is unavailable', async () => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
  const { service, human, assistant } = setup();
  human.decide.mockResolvedValueOnce({ route: 'openai' });
  await service.handle('webhook-secret', { update_id: 602, message: { ...update('user61785').business_message, chat: { id: 123, type: 'private' } } });
  expect(human.decide).toHaveBeenCalledOnce();
  expect(assistant.respond).toHaveBeenCalledOnce();
  expect(human.escalate).not.toHaveBeenCalled();
});

it('keeps later client messages in an active human case', async () => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
  vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
  const { service, human, assistant, repository } = setup();
  repository.getConversation.mockResolvedValueOnce({ telegramChatId: '123', clientId: '456', assistantEnabled: true, state: 'active', summary: '', activeHumanRequestId: 'case-1', createdAt: '2026-09-25T10:00:00.000Z', updatedAt: '2026-09-25T10:00:00.000Z' } as never);
  await service.handle('webhook-secret', { update_id: 601, message: { ...update('user61785').business_message, chat: { id: 123, type: 'private' } } });
  expect(human.queueExisting).toHaveBeenCalledWith('case-1', 'Hello', 601);
  expect(human.decide).not.toHaveBeenCalled();
  expect(assistant.respond).not.toHaveBeenCalled();
});

it('enrolls a listed responder before client sender restriction, without invoking OpenAI', async () => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
  vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
  const { service, human, assistant, repository } = setup();
  human.isConfiguredUsername.mockResolvedValueOnce(true);
  await service.handle('webhook-secret', { update_id: 700, message: { message_id: 1, chat: { id: 777, type: 'private' }, from: { id: 888, username: 'Helper123' }, text: '/start' } });
  expect(repository.claimTelegramUpdate).toHaveBeenCalledWith(700);
  expect(human.enroll).toHaveBeenCalledWith('888', '777', 'helper123');
  expect(human.send).toHaveBeenCalledWith('777', undefined, expect.stringContaining('Підключено'));
  expect(assistant.respond).not.toHaveBeenCalled();
});

it('accepts /answer only from enrolled configured responders', async () => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
  vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
  const { service, human, assistant, repository } = setup();
  human.authorizedResponder.mockResolvedValueOnce({ userId: '888', chatId: '777', username: 'helper123', enrolledAt: '2026-09-25T10:00:00.000Z' } as never);
  await service.handle('webhook-secret', { update_id: 701, message: { message_id: 1, chat: { id: 777, type: 'private' }, from: { id: 888, username: 'Helper123' }, text: '/answer case-1 Human answer' } });
  expect(human.reply).toHaveBeenCalledWith('case-1', 'Human answer', 'telegram:888');
  expect(assistant.respond).not.toHaveBeenCalled();
  expect(repository.saveConversation).not.toHaveBeenCalled();
});
