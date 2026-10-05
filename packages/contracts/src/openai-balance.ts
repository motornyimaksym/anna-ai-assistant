import { z } from 'zod';

export const openAiBalanceResponseSchema = z.object({
  totalCredits: z.number().finite().nonnegative().nullable(),
  used: z.number().finite(),
  estimatedRemaining: z.number().finite().nullable(),
  currency: z.literal('usd'),
  updatedAt: z.string().datetime(),
}).strict();

export type OpenAiBalanceResponse = z.infer<typeof openAiBalanceResponseSchema>;
