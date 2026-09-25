import { z } from 'zod';

export const telegramScheduleSlotSchema = z.object({
  messageId: z.string().min(1).max(64),
  text: z.string().min(1).max(4_000).refine((text) => text.trim().length > 0, 'Slot text must not be blank'),
  createdAt: z.string().datetime(),
});
export const telegramScheduleSlotsResponseSchema = z.object({
  sourceChatTitle: z.string().min(1).max(255).optional(),
  syncedAt: z.string().datetime().optional(),
  slots: z.array(telegramScheduleSlotSchema).max(5),
});

export type TelegramScheduleSlot = z.infer<typeof telegramScheduleSlotSchema>;
export type TelegramScheduleSlotsResponse = z.infer<typeof telegramScheduleSlotsResponseSchema>;
