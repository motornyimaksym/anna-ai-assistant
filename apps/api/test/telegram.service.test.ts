import type { AssistantReply, OpenAiService } from '../src/openai.service.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookingRepository } from '../src/repository.js';
import { TelegramService } from '../src/telegram.service.js';

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
  return { service: new TelegramService(repository as unknown as BookingRepository, assistant as unknown as OpenAiService), repository, send, assistant, order };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Telegram private test restriction', () => {
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

it('sends configured service photos, formatted captions, and inline URL buttons', async () => {
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
  expect(order).toEqual(['sendChatAction', 'sendMessage', 'sendPhoto']);
  expect(JSON.parse(send.mock.calls[1]![1]!.body as string)).toMatchObject({ text: 'Here are the services.' });
  expect(photoCall).toBeTruthy();
  expect(JSON.parse(photoCall![1]!.body as string)).toMatchObject({ photo: 'https://firebasestorage.googleapis.com/v0/b/demo/o/massage.jpg?token=x', caption: 'Classic massage', caption_entities: [{ type: 'bold', offset: 0, length: 7 }], reply_markup: { inline_keyboard: [[{ text: 'Book', url: 'https://example.com/book' }]] } });
});

it('continues delivering later service cards if one card fails', async () => {
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

  expect(send.mock.calls.some(([, init]) => (JSON.parse(init?.body as string) as { text?: string }).text?.startsWith('Second'))).toBe(true);
});
