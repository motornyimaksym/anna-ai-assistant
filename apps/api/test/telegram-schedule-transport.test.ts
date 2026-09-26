import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from 'telegram';
import { TelegramAccountTransport } from '../src/telegram-account.transport.js';

const client = vi.hoisted(() => ({
  connect: vi.fn(), getDialogs: vi.fn(), getMessages: vi.fn(), destroy: vi.fn(),
}));
vi.mock('telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('telegram')>();
  return { ...actual, TelegramClient: vi.fn(function () { return client; }) };
});

const credentials = { apiId: 123, apiHash: 'test' };
const dialog = { id: '-10042', title: 'Календар та планування часу', isGroup: true, inputEntity: { peer: 'schedule' } };
const message = (id: number, text: string) => new Api.Message({
  id, peerId: new Api.PeerChat({ chatId: 42 as never }), date: 1_790_330_000 + id, message: text,
});

beforeEach(() => {
  vi.resetAllMocks();
  client.connect.mockResolvedValue(undefined);
  client.destroy.mockResolvedValue(undefined);
  client.getDialogs.mockResolvedValue([dialog]);
  client.getMessages.mockResolvedValue([5, 4, 3, 2, 1].map((id) => message(id, `Slot ${id}`)));
});
afterEach(() => vi.useRealTimers());

describe('Telegram schedule history transport', () => {
  it('requests only the latest five messages and returns them chronologically', async () => {
    const result = await new TelegramAccountTransport().readScheduleMessages(credentials, { session: '' });
    expect(client.getMessages).toHaveBeenCalledWith(dialog.inputEntity, { limit: 5 });
    expect(result).toMatchObject({ sourcePeerId: '-10042', sourceChatTitle: dialog.title });
    expect(result?.slots.map((slot) => slot.messageId)).toEqual(['1', '2', '3', '4', '5']);
    expect(result?.slots[0]).toEqual({ messageId: '1', text: 'Slot 1', createdAt: new Date(1_790_330_001_000).toISOString() });
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it('uses the stored peer ID after the chat is renamed', async () => {
    client.getDialogs.mockResolvedValue([{ ...dialog, title: 'Renamed group' }]);
    const result = await new TelegramAccountTransport().readScheduleMessages(credentials, { session: '' }, '-10042');
    expect(result?.sourceChatTitle).toBe('Renamed group');
    expect(client.getMessages).toHaveBeenCalledWith(dialog.inputEntity, { limit: 5 });
  });

  it('ignores empty and service messages while preserving multiline text and bounding size', async () => {
    client.getMessages.mockResolvedValue([
      message(5, 'x'.repeat(4_100)), message(4, 'Today\n15:00'), message(3, '  '),
      new Api.MessageEmpty({ id: 2 }), message(1, 'Tomorrow 09:00'),
    ]);
    const result = await new TelegramAccountTransport().readScheduleMessages(credentials, { session: '' });
    expect(result?.slots.map((slot) => slot.messageId)).toEqual(['1', '4', '5']);
    expect(result?.slots[1]?.text).toBe('Today\n15:00');
    expect(result?.slots[2]?.text).toHaveLength(4_000);
  });

  it('skips history fetching when no source chat matches', async () => {
    client.getDialogs.mockResolvedValue([]);
    await expect(new TelegramAccountTransport().readScheduleMessages(credentials, { session: '' })).resolves.toBeUndefined();
    expect(client.getMessages).not.toHaveBeenCalled();
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it('closes the connection after a Telegram error', async () => {
    client.getMessages.mockRejectedValue(new Error('RPC failure'));
    await expect(new TelegramAccountTransport().readScheduleMessages(credentials, { session: '' })).rejects.toThrow('RPC failure');
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it('times out after twenty seconds and closes a late connection', async () => {
    vi.useFakeTimers();
    let connected!: () => void;
    client.connect.mockImplementation(() => new Promise<void>((resolve) => { connected = resolve; }));
    const pending = new TelegramAccountTransport().readScheduleMessages(credentials, { session: '' });
    const assertion = expect(pending).rejects.toThrow('TELEGRAM_TIMEOUT');
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    connected();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getDialogs).not.toHaveBeenCalled();
    expect(client.destroy).toHaveBeenCalledTimes(2);
  });
});


it('lists private chats alongside groups using stable IDs', async () => {
  client.getDialogs.mockResolvedValue([dialog, { id: '99', title: 'Personal schedule' }]);
  const result = await new TelegramAccountTransport().listScheduleChats(credentials, { session: '' });
  expect(result.chats).toEqual([{ id: '-10042', title: dialog.title, kind: 'group' }, { id: '99', title: 'Personal schedule', kind: 'private' }]);
  expect(client.getMessages).not.toHaveBeenCalled();
  expect(client.destroy).toHaveBeenCalledOnce();
});
