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

it('validates source IDs without accepting caller supplied titles', async () => {
  const { telegramScheduleSourceSchema } = await import('./telegram-schedule-import.js');
  expect(telegramScheduleSourceSchema.safeParse({ chatId: '-10042' }).success).toBe(true);
  expect(telegramScheduleSourceSchema.safeParse({ chatId: '@name' }).success).toBe(false);
  expect(telegramScheduleSourceSchema.safeParse({ chatId: '42', title: 'Spoofed' }).success).toBe(false);
});

it('accepts optional topic IDs and rejects invalid or spoofed topic selection', async () => {
  const { telegramScheduleSourceSchema, telegramScheduleTopicsQuerySchema } = await import('./telegram-schedule-import.js');
  expect(telegramScheduleSourceSchema.parse({ chatId: '-10042', topicId: 1 }).topicId).toBe(1);
  for (const topicId of [0, -1, 1.5, '42', 2147483648]) expect(telegramScheduleSourceSchema.safeParse({ chatId: '-10042', topicId }).success).toBe(false);
  expect(telegramScheduleSourceSchema.safeParse({ chatId: '-10042', topicId: 42, topicTitle: 'Spoof' }).success).toBe(false);
  expect(telegramScheduleTopicsQuerySchema.safeParse({ chatId: '-10042', q: 'Календар' }).success).toBe(true);
  expect(telegramScheduleTopicsQuerySchema.safeParse({ chatId: '-10042', q: 'x'.repeat(129) }).success).toBe(false);
});
