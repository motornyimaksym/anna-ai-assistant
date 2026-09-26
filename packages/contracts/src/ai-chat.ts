import { z } from 'zod';
export const aiChatIdSchema = z.string().uuid();
export const aiChatInputSchema = z.object({ text: z.string().trim().min(1).max(4000) }).strict();
export const aiChatMessageSchema = z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(6000), createdAt: z.string().datetime() });
export const aiChatActionSchema = z.object({
  id: aiChatIdSchema, tool: z.enum(['send_message', 'reply_to_message']),
  chatId: z.string().regex(/^-?\d+$/), chatTitle: z.string().max(255), text: z.string().min(1).max(4000),
  messageId: z.number().int().positive().optional(), expiresAt: z.string().datetime(),
  status: z.enum(['pending', 'sending', 'sent', 'cancelled', 'uncertain']),
}).refine((value) => value.tool !== 'reply_to_message' || !!value.messageId, 'Reply message ID is required');
export const aiChatSummarySchema = z.object({ id: aiChatIdSchema, title: z.string().max(80), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
export const aiChatThreadSchema = aiChatSummarySchema.extend({ messages: aiChatMessageSchema.array().max(40), action: aiChatActionSchema.optional() });
export type AiChatThread = z.infer<typeof aiChatThreadSchema>;
export type AiChatAction = z.infer<typeof aiChatActionSchema>;
export type AiChatSummary = z.infer<typeof aiChatSummarySchema>;
