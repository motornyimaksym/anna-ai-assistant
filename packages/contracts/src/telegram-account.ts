import { z } from 'zod';

export const telegramAccountStartSchema = z.object({ phone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'Use an international number, e.g. +380…') }).strict();
export const telegramAccountCodeSchema = z.object({ code: z.string().trim().regex(/^\d{4,8}$/, 'Enter the Telegram login code') }).strict();
export const telegramAccountPasswordSchema = z.object({ password: z.string().min(1).max(256) }).strict();
export const telegramAccountStatusSchema = z.object({
  configured: z.boolean(),
  phase: z.enum(['disconnected', 'code', 'password', 'connected']),
  maskedPhone: z.string().optional(),
  username: z.string().optional(),
  expiresAt: z.number().optional(),
});
export type TelegramAccountStatus = z.infer<typeof telegramAccountStatusSchema>;
