import { describe, expect, it } from 'vitest';
import { telegramScheduleSlotsResponseSchema } from './telegram-schedule-import.js';

describe('Telegram schedule import response', () => {
  it('accepts a read-only snapshot of at most five text messages', () => {
    expect(telegramScheduleSlotsResponseSchema.parse({
      sourceChatTitle: 'Календар та планування часу',
      syncedAt: '2026-09-25T10:00:00.000Z',
      slots: [{ messageId: '12', text: 'Сьогодні 15:00', createdAt: '2026-09-25T09:30:00.000Z' }],
    }).slots).toHaveLength(1);
  });

  it('rejects more than five messages, blank text, or invalid timestamps', () => {
    const slot = { messageId: '12', text: 'Вільний час', createdAt: '2026-09-25T09:30:00.000Z' };
    expect(telegramScheduleSlotsResponseSchema.safeParse({ slots: Array.from({ length: 6 }, (_, index) => ({ ...slot, messageId: String(index) })) }).success).toBe(false);
    expect(telegramScheduleSlotsResponseSchema.safeParse({ slots: [{ ...slot, text: '  ' }] }).success).toBe(false);
    expect(telegramScheduleSlotsResponseSchema.safeParse({ slots: [{ ...slot, createdAt: 'yesterday' }] }).success).toBe(false);
  });
});
