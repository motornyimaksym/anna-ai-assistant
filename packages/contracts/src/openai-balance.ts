import { z } from 'zod';

export const updateOpenAiBalanceSchema = z.object({ balance: z.number().finite().nonnegative() }).strict();

export const openAiBalanceBaselineSchema = updateOpenAiBalanceSchema.extend({
  updatedAt: z.string().datetime(),
}).strict();

export type OpenAiBalanceBaseline = z.infer<typeof openAiBalanceBaselineSchema>;

export const openAiBalanceResponseSchema = z.object({
  totalCredits: z.number().finite().nonnegative().nullable(),
  used: z.number().finite(),
  estimatedRemaining: z.number().finite().nullable(),
  currency: z.literal('usd'),
  updatedAt: z.string().datetime(),
}).strict();

export type OpenAiBalanceResponse = z.infer<typeof openAiBalanceResponseSchema>;
