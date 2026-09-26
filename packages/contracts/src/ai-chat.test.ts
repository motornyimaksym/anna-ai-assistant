import { describe, expect, it } from 'vitest';
import { aiChatInputSchema, aiChatActionSchema } from './ai-chat.js';
describe('private AI chat contracts', () => {
  it('bounds prompts and rejects caller-provided tools or owners', () => {
    expect(aiChatInputSchema.parse({ text: ' Search Telegram ' })).toEqual({ text: 'Search Telegram' });
    for (const value of [{ text: ' ' }, { text: 'x'.repeat(4001) }, { text: 'hi', uid: 'other' }, { text: 'hi', tool: 'send_message' }]) expect(aiChatInputSchema.safeParse(value).success).toBe(false);
  });
  it('requires reply targets and numeric peers', () => {
    const value = { id: 'de51f614-fffc-4a23-824f-788758a041fb', tool: 'reply_to_message', chatId: '-10042', chatTitle: 'Team', text: 'Hello', expiresAt: '2026-09-25T12:00:00.000Z', status: 'pending' };
    expect(aiChatActionSchema.safeParse(value).success).toBe(false);
    expect(aiChatActionSchema.safeParse({ ...value, messageId: 7 }).success).toBe(true);
    expect(aiChatActionSchema.safeParse({ ...value, messageId: 7, chatId: '@guess' }).success).toBe(false);
  });
});
