import { z } from 'zod';

export const telegramScheduleTopicIdSchema = z.number().int().min(1).max(2_147_483_647);

export const telegramScheduleSlotSchema = z.object({
  messageId: z.string().min(1).max(64),
  text: z.string().min(1).max(4_000).refine((text) => text.trim().length > 0, 'Slot text must not be blank'),
  createdAt: z.string().datetime(),
});
export const telegramScheduleSlotsResponseSchema = z.object({
  sourcePeerId: z.string().optional(),
  sourceTopicId: telegramScheduleTopicIdSchema.optional(),
  sourceTopicTitle: z.string().min(1).max(255).optional(),
  status: z.enum(['idle', 'syncing', 'success', 'source_not_found', 'disconnected', 'account_busy', 'connection_failed', 'timeout']).optional(),
  lastAttemptAt: z.string().datetime().optional(),
  nextAttemptAt: z.string().datetime().optional(),
  sourceChatTitle: z.string().min(1).max(255).optional(),
  syncedAt: z.string().datetime().optional(),
  slots: z.array(telegramScheduleSlotSchema).max(5),
});

export type TelegramScheduleSlot = z.infer<typeof telegramScheduleSlotSchema>;
export type TelegramScheduleSlotsResponse = z.infer<typeof telegramScheduleSlotsResponseSchema>;

export const telegramScheduleSourceSchema = z.object({ chatId: z.string().regex(/^-?\d+$/).max(32), topicId: telegramScheduleTopicIdSchema.optional() }).strict();
export const telegramScheduleChatSchema = z.object({ id: z.string().regex(/^-?\d+$/), title: z.string().min(1).max(255), kind: z.enum(['private', 'group', 'channel']), isForum: z.boolean().optional() });
export const telegramScheduleChatsSchema = z.object({ chats: telegramScheduleChatSchema.array().max(1000), truncated: z.boolean() });
export type TelegramScheduleChats = z.infer<typeof telegramScheduleChatsSchema>;

export const telegramScheduleTopicsQuerySchema = telegramScheduleSourceSchema.pick({ chatId: true }).extend({ q: z.string().trim().max(128).optional() }).strict();
export const telegramScheduleTopicsSchema = z.object({ topics: z.array(z.object({ id: telegramScheduleTopicIdSchema, title: z.string().min(1).max(255) })).max(100), truncated: z.boolean() });
export type TelegramScheduleTopics = z.infer<typeof telegramScheduleTopicsSchema>;
