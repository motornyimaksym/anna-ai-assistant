import type { OpenAiService } from '../src/openai.service.js';
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

const setup = () => {
  const repository = {
    appendMessage: vi.fn(),
    claimTelegramUpdate: vi.fn(async () => true),
    getConversation: vi.fn(async () => undefined),
    saveConversation: vi.fn(async (conversation: unknown) => conversation),
  };
  const send = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true }));
  vi.stubGlobal('fetch', send);
  const assistant = { respond: vi.fn(async () => 'AI reply') };
  return { service: new TelegramService(repository as unknown as BookingRepository, assistant as unknown as OpenAiService), repository, send, assistant };
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
    const { service, repository, send, assistant } = setup();

    await service.handle('webhook-secret', update('User61785'));

    expect(repository.claimTelegramUpdate).toHaveBeenCalledWith(101);
    expect(repository.saveConversation).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
    expect(assistant.respond).toHaveBeenCalledOnce();
    expect(JSON.parse(send.mock.calls[0]![1]!.body as string)).toMatchObject({ chat_id: '123', business_connection_id: 'connection-1' });
  });
});

it('supports allowed private DMs but ignores groups and duplicate updates', async () => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
  const { service, repository, assistant } = setup();
  const message = { ...update('user61785').business_message, chat: { id: 123, type: 'group' } };
  await service.handle('webhook-secret', { update_id: 1, message });
  expect(assistant.respond).not.toHaveBeenCalled();
  message.chat.type = 'private';
  await service.handle('webhook-secret', { update_id: 2, message });
  expect(assistant.respond).toHaveBeenCalledOnce();
  repository.claimTelegramUpdate.mockResolvedValueOnce(false);
  await service.handle('webhook-secret', { update_id: 2, message });
  expect(assistant.respond).toHaveBeenCalledOnce();
});
