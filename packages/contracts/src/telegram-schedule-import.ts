import { z } from 'zod';

export const telegramScheduleSlotSchema = z.object({
  messageId: z.string().min(1).max(64),
  text: z.string().min(1).max(4_000).refine((text) => text.trim().length > 0, 'Slot text must not be blank'),
  createdAt: z.string().datetime(),
});
export const telegramScheduleSlotsResponseSchema = z.object({
  sourcePeerId: z.string().optional(),
  status: z.enum(['idle', 'syncing', 'success', 'source_not_found', 'disconnected', 'account_busy', 'connection_failed', 'timeout']).optional(),
  lastAttemptAt: z.string().datetime().optional(),
  nextAttemptAt: z.string().datetime().optional(),
  sourceChatTitle: z.string().min(1).max(255).optional(),
  syncedAt: z.string().datetime().optional(),
  slots: z.array(telegramScheduleSlotSchema).max(5),
});

export type TelegramScheduleSlot = z.infer<typeof telegramScheduleSlotSchema>;
export type TelegramScheduleSlotsResponse = z.infer<typeof telegramScheduleSlotsResponseSchema>;

export const telegramScheduleSourceSchema = z.object({ chatId: z.string().regex(/^-?\d+$/).max(32) }).strict();
export const telegramScheduleChatSchema = z.object({ id: z.string().regex(/^-?\d+$/), title: z.string().min(1).max(255), kind: z.enum(['private', 'group', 'channel']) });
export const telegramScheduleChatsSchema = z.object({ chats: telegramScheduleChatSchema.array().max(1000), truncated: z.boolean() });
export type TelegramScheduleChats = z.infer<typeof telegramScheduleChatsSchema>;
