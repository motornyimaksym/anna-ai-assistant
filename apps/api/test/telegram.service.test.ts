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
    claimTelegramUpdate: vi.fn(async () => true),
    getConversation: vi.fn(async () => undefined),
    saveConversation: vi.fn(async (conversation: unknown) => conversation),
  };
  const send = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true }));
  vi.stubGlobal('fetch', send);
  return { service: new TelegramService(repository as unknown as BookingRepository), repository, send };
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Telegram private test restriction', () => {
  it('ignores other senders and missing usernames before claiming their updates', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
    vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
    const { service, repository, send } = setup();

    await service.handle('webhook-secret', update('anotheruser'));
    await service.handle('webhook-secret', update());

    expect(repository.claimTelegramUpdate).not.toHaveBeenCalled();
    expect(repository.saveConversation).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('fails closed when no allowed username is configured', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
    vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', undefined);
    const { service, repository, send } = setup();

    await service.handle('webhook-secret', update('user61785'));

    expect(repository.claimTelegramUpdate).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('replies only to the allowed username, ignoring case', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-bot-token');
    vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
    const { service, repository, send } = setup();

    await service.handle('webhook-secret', update('User61785'));

    expect(repository.claimTelegramUpdate).toHaveBeenCalledWith(101);
    expect(repository.saveConversation).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
    expect(JSON.parse(send.mock.calls[0]![1]!.body as string)).toMatchObject({ chat_id: '123', business_connection_id: 'connection-1' });
  });
});
