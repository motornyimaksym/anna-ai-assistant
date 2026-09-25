import { z } from 'zod';

const usernameSchema = z.string().trim().transform((value) => value.replace(/^@/, '').toLowerCase()).pipe(z.string().regex(/^[a-z0-9_]{5,32}$/, 'Enter a Telegram username (5–32 letters, digits, or underscores)'));
export const updateHumanAssistanceSettingsSchema = z.object({
  thresholdPercent: z.number().int().min(0).max(100),
  usernames: z.array(usernameSchema).max(20),
}).strict().superRefine(({ usernames }, ctx) => {
  if (new Set(usernames).size !== usernames.length) ctx.addIssue({ code: 'custom', path: ['usernames'], message: 'Telegram usernames must be unique' });
});
export const humanAssistanceSettingsResponseSchema = z.object({
  thresholdPercent: z.number().int().min(0).max(100),
  responders: z.array(z.object({ username: z.string(), connected: z.boolean() })),
  updatedAt: z.string().datetime().optional(),
});
export const humanRequestSchema = z.object({
  id: z.string(), conversationId: z.string(), telegramChatId: z.string(), businessConnectionId: z.string().optional(),
  telegramUpdateId: z.number().int(),
  status: z.enum(['open', 'sending', 'uncertain', 'answered', 'released']),
  reason: z.enum(['knowledge_gap', 'jev_unavailable']), probability: z.number().min(0).max(1).optional(),
  thresholdPercent: z.number().int().min(0).max(100), question: z.string(), queuedMessages: z.array(z.string()),
  notifications: z.record(z.enum(['pending', 'sending', 'sent', 'failed', 'uncertain'])),
  acknowledgement: z.enum(['pending', 'sending', 'sent', 'failed', 'uncertain']),
  lastAnswer: z.string().optional(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export const humanReplySchema = z.object({ text: z.string().trim().min(1).max(4000) }).strict();
export const humanReleaseResponseSchema = z.object({ ok: z.literal(true) });
export type HumanAssistanceSettings = z.infer<typeof updateHumanAssistanceSettingsSchema>;
export type HumanRequestDto = z.infer<typeof humanRequestSchema>;
