import { describe, expect, it } from 'vitest';
import { conversationSchema } from './index.js';

const baseConversation = {
  telegramChatId: 'chat-123',
  assistantEnabled: true,
  createdAt: '2026-09-29T10:00:00.000Z',
  updatedAt: '2026-09-29T10:00:00.000Z',
};

describe('conversation Telegram username', () => {
  it('keeps legacy conversations valid and accepts normalized usernames', () => {
    expect(conversationSchema.parse(baseConversation).telegramUsername).toBeUndefined();
    expect(conversationSchema.parse({ ...baseConversation, telegramUsername: 'client_123' }).telegramUsername).toBe('client_123');
    expect(conversationSchema.parse({ ...baseConversation, telegramUsername: null }).telegramUsername).toBeNull();
  });

  it('rejects usernames that were not normalized before persistence', () => {
    expect(() => conversationSchema.parse({ ...baseConversation, telegramUsername: '@Client_123' })).toThrow();
  });
});
