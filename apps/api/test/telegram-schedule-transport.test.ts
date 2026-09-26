import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from 'telegram';
import { telegramScheduleChatsSchema, telegramScheduleSlotsResponseSchema } from '@booking/contracts';
import { TelegramAccountTransport } from '../src/telegram-account.transport.js';

const client = vi.hoisted(() => ({
  connect: vi.fn(), getDialogs: vi.fn(), getMessages: vi.fn(), invoke: vi.fn(), destroy: vi.fn(),
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

it('keeps unnamed dialogs selectable and returns valid titles for listing and history', async () => {
  const cases = [
    { title: '', name: '  Saved name  ', expected: 'Saved name' },
    { title: ' \n ', name: '', expected: 'Telegram chat -10042' },
    { title: undefined, name: undefined, expected: 'Telegram chat -10042' },
    { title: '', name: ' \t ', expected: 'Telegram chat -10042' },
    { title: '  Actual title  ', name: 'Other name', expected: 'Actual title' },
    { title: 'x'.repeat(300), name: '', expected: 'x'.repeat(255) },
  ];
  for (const { title, name, expected } of cases) {
    client.getDialogs.mockResolvedValue([{ ...dialog, title, name }, { id: '99', title: 'Named chat' }]);
    const transport = new TelegramAccountTransport();
    const listing = telegramScheduleChatsSchema.parse(await transport.listScheduleChats(credentials, { session: '' }));
    expect(listing.chats).toEqual([
      { id: '-10042', title: expected, kind: 'group' },
      { id: '99', title: 'Named chat', kind: 'private' },
    ]);
    const history = await transport.readScheduleMessages(credentials, { session: '' }, listing.chats[0]!.id);
    expect(telegramScheduleSlotsResponseSchema.parse(history).sourceChatTitle).toBe(expected);
    expect(history?.sourcePeerId).toBe('-10042');
  }
});

const forumDialog = { ...dialog, entity: new Api.Channel({ id: 42 as never, title: dialog.title, photo: new Api.ChatPhotoEmpty(), date: 0, forum: true, megagroup: true }) };
const forumTopic = (id: number, title = 'Календар') => new Api.ForumTopic({ id, title, date: 0, iconColor: 0, topMessage: 100, readInboxMaxId: 0, readOutboxMaxId: 0, unreadCount: 0, unreadMentionsCount: 0, unreadReactionsCount: 0, fromId: new Api.PeerUser({ userId: 1 as never }), notifySettings: new Api.PeerNotifySettings({}) });

it('marks forums and lists/searches topics without reading history, excluding deleted topics', async () => {
  client.getDialogs.mockResolvedValue([forumDialog]);
  client.invoke.mockResolvedValue({ count: 105, topics: [forumTopic(1, 'General'), forumTopic(42, '  '), new Api.ForumTopicDeleted({ id: 8 })] });
  const transport = new TelegramAccountTransport();
  expect((await transport.listScheduleChats(credentials, { session: '' })).chats[0]?.isForum).toBe(true);
  expect(await transport.listScheduleTopics(credentials, { session: '' }, '-10042', 'Календар')).toEqual({ topics: [{ id: 1, title: 'General' }, { id: 42, title: 'Telegram topic 42' }], truncated: true });
  expect(client.invoke.mock.calls[0]?.[0]).toMatchObject({ className: 'channels.GetForumTopics', q: 'Календар', limit: 100 });
  expect(client.getMessages).not.toHaveBeenCalled();
});

it('validates topics by stable ID and reads only the selected thread after rename', async () => {
  client.getDialogs.mockResolvedValue([forumDialog]);
  client.invoke.mockResolvedValue({ count: 1, topics: [forumTopic(42, 'Renamed')] });
  const result = await new TelegramAccountTransport().readScheduleMessages(credentials, { session: '' }, '-10042', 42);
  expect(client.invoke.mock.calls[0]?.[0]).toMatchObject({ className: 'channels.GetForumTopicsByID', topics: [42] });
  expect(client.getMessages).toHaveBeenCalledWith(dialog.inputEntity, { limit: 5, replyTo: 42 });
  expect(result).toMatchObject({ sourcePeerId: '-10042', sourceTopicId: 42, sourceTopicTitle: 'Renamed' });
});

it('never falls back to whole-chat history for deleted topics or nonforum groups', async () => {
  const transport = new TelegramAccountTransport();
  expect(await transport.readScheduleMessages(credentials, { session: '' }, '-10042', 42)).toBeUndefined();
  client.getDialogs.mockResolvedValue([forumDialog]);
  client.invoke.mockResolvedValue({ topics: [new Api.ForumTopicDeleted({ id: 42 })] });
  expect(await transport.readScheduleMessages(credentials, { session: '' }, '-10042', 42)).toBeUndefined();
  expect(client.getMessages).not.toHaveBeenCalled();
});

it('reads General without including other topics or topic creation service messages', async () => {
  client.getDialogs.mockResolvedValue([forumDialog]);
  client.invoke.mockResolvedValue({ topics: [forumTopic(1, 'General')] });
  const other = message(10, 'Other topic');
  other.replyTo = new Api.MessageReplyHeader({ forumTopic: true, replyToMsgId: 42 });
  const nested = message(9, 'Other reply');
  nested.replyTo = new Api.MessageReplyHeader({ forumTopic: true, replyToMsgId: 10, replyToTopId: 42 });
  const generalReply = message(8, 'General reply');
  generalReply.replyTo = new Api.MessageReplyHeader({ replyToMsgId: 7 });
  client.getMessages.mockResolvedValue([other, nested, generalReply, message(7, 'General')]);
  const result = await new TelegramAccountTransport().readScheduleMessages(credentials, { session: '' }, '-10042', 1);
  expect(result?.slots.map((slot) => slot.messageId)).toEqual(['7', '8']);
  expect(client.getMessages).toHaveBeenCalledWith(dialog.inputEntity, { limit: 100, offsetId: 0 });
});

it('fails safely when the bounded General scan cannot reach five messages', async () => {
  client.getDialogs.mockResolvedValue([forumDialog]);
  client.invoke.mockResolvedValue({ topics: [forumTopic(1)] });
  let page = 0;
  client.getMessages.mockImplementation(async () => Array.from({ length: 100 }, (_, index) => {
    const item = message(2000 - page * 100 - index, 'Other topic');
    item.replyTo = new Api.MessageReplyHeader({ forumTopic: true, replyToMsgId: 42 });
    if (index === 99) page++;
    return item;
  }));
  await expect(new TelegramAccountTransport().readScheduleMessages(credentials, { session: '' }, '-10042', 1)).rejects.toThrow('TELEGRAM_HISTORY_LIMIT');
  expect(client.getMessages).toHaveBeenCalledTimes(10);
  expect(client.destroy).toHaveBeenCalledOnce();
});
