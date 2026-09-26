import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatService } from '../src/ai-chat.service.js';
import { aiChatThreadSchema } from '@booking/contracts';
import type { StoredThread } from '../src/ai-chat.store.js';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/openai-transport.js', () => ({ requestOpenAiResponse: request }));
const id = 'de51f614-fffc-4a23-824f-788758a041fb';
const output = (name: string, args: unknown) => ({ output: [{ type: 'function_call', name, arguments: JSON.stringify(args), call_id: 'call-1' }] });
const answer = (text: string) => ({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });
function fixture() {
  let thread: StoredThread = { id, title: 'New chat', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
  const store = {
    acquire: vi.fn(async (_uid: string, _id: string) => structuredClone(thread)),
    save: vi.fn(async (_uid: string, next: StoredThread, _release?: boolean) => { thread = structuredClone(next); }),
    view: (value: StoredThread) => aiChatThreadSchema.parse(value),
  };
  const telegram = { call: vi.fn(async () => ({ text: JSON.stringify({ id: -10042, title: 'Team' }), sessionFingerprint: 'account-fingerprint' })) };
  const service = new AiChatService(store as never, telegram as never);
  return { service, store, telegram, get: () => thread, set: (value: StoredThread) => { thread = value; } };
}
beforeEach(() => vi.resetAllMocks());
describe('isolated AI conversation', () => {
  it('executes reads automatically with isolated history and no booking tools', async () => {
    request.mockResolvedValueOnce(output('get_chats', {})).mockResolvedValueOnce(answer('Found your chats.'));
    const f = fixture();
    const result = await f.service.message('owner', id, 'Find my chats');
    expect(f.telegram.call).toHaveBeenCalledWith('get_chats', {}, undefined, expect.any(AbortSignal));
    expect(result.messages.at(-1)?.text).toBe('Found your chats.');
    const body = request.mock.calls[0]![0];
    expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual(['get_chats', 'get_chat', 'get_messages', 'search_messages', 'send_message', 'reply_to_message']);
    expect(body.instructions).not.toContain('MEDIA STORE');
  });
  it('proposes without sending, then consumes exact action before one confirmed send', async () => {
    request.mockResolvedValueOnce(output('send_message', { chat_id: '-10042', message: 'Hello team' }));
    const f = fixture();
    const result = await f.service.message('owner', id, 'Send hello');
    expect(f.telegram.call).toHaveBeenCalledTimes(1);
    expect(result.action).toMatchObject({ chatId: '-10042', chatTitle: 'Team', text: 'Hello team', status: 'pending' });
    expect(result.action).not.toHaveProperty('sessionFingerprint');
    f.telegram.call.mockImplementationOnce(async () => {
      expect(f.get().action?.status).toBe('sending');
      return { text: 'Message sent successfully.', sessionFingerprint: 'account-fingerprint' };
    });
    const confirmed = await f.service.action('owner', id, result.action!.id, true);
    expect(confirmed.action?.status).toBe('sent');
    expect(f.telegram.call).toHaveBeenLastCalledWith('send_message', { chat_id: '-10042', message: 'Hello team' }, 'account-fingerprint');
    await expect(f.service.action('owner', id, result.action!.id, true)).rejects.toThrow();
    expect(f.telegram.call).toHaveBeenCalledTimes(2);
  });
  it('cancels without calling a write tool', async () => {
    request.mockResolvedValueOnce(output('reply_to_message', { chat_id: '-10042', message_id: 12, text: 'Thanks' }));
    const f = fixture(); const result = await f.service.message('owner', id, 'Draft a reply');
    expect(result.action?.messageId).toBe(12);
    const cancelled = await f.service.action('owner', id, result.action!.id, false);
    expect(cancelled.action?.status).toBe('cancelled');
    expect(f.telegram.call).toHaveBeenCalledTimes(1);
  });
  it('rejects expired and stale confirmations', async () => {
    request.mockResolvedValueOnce(output('send_message', { chat_id: '-10042', message: 'Hello' }));
    const f = fixture(); const result = await f.service.message('owner', id, 'Draft');
    await expect(f.service.action('owner', id, id, true)).rejects.toThrow();
    f.get().action!.expiresAt = '2020-01-01T00:00:00.000Z';
    await expect(f.service.action('owner', id, result.action!.id, true)).rejects.toThrow();
    expect(f.telegram.call).toHaveBeenCalledTimes(1);
  });
  it('does not interpret natural-language yes as confirmation', async () => {
    request.mockResolvedValueOnce(output('send_message', { chat_id: '-10042', message: 'Hello' })).mockResolvedValueOnce(answer('Please use the confirmation card.'));
    const f = fixture(); await f.service.message('owner', id, 'Draft');
    const result = await f.service.message('owner', id, 'yes send it');
    expect(result.action?.status).toBe('cancelled');
    expect(f.telegram.call).toHaveBeenCalledTimes(1);
  });
  it('records uncertainty without retrying after a failed confirmed write', async () => {
    request.mockResolvedValueOnce(output('send_message', { chat_id: '-10042', message: 'Hello' }));
    const f = fixture(); const result = await f.service.message('owner', id, 'Draft');
    f.telegram.call.mockRejectedValueOnce(new Error('timeout'));
    const uncertain = await f.service.action('owner', id, result.action!.id, true);
    expect(uncertain.action?.status).toBe('uncertain');
    await expect(f.service.action('owner', id, result.action!.id, true)).rejects.toThrow();
    expect(f.telegram.call).toHaveBeenCalledTimes(2);
  });
  it('blocks unlisted mutations and malformed write arguments', async () => {
    request.mockResolvedValueOnce(output('delete_messages', { chat_id: '42' })).mockResolvedValueOnce(output('send_message', { chat_id: '@guessed', message: 'Hi' })).mockResolvedValueOnce(answer('Please identify the recipient.'));
    const f = fixture(); const result = await f.service.message('owner', id, 'Delete messages');
    expect(f.telegram.call).not.toHaveBeenCalled(); expect(result.action).toBeUndefined();
  });
  it('caps tool calls even if the model keeps requesting reads', async () => {
    request.mockResolvedValue(output('get_chats', {})); const f = fixture();
    await f.service.message('owner', id, 'Read everything');
    expect(f.telegram.call).toHaveBeenCalledTimes(8);
  });
});
