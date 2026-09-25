import { z } from 'zod';

export const knowledgeBaseContentSchema = z.string().min(1).max(12_000).refine((content) => content.trim().length > 0, 'Knowledge base must not be blank');
export const knowledgeBaseServiceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  durationMinutes: z.number().int().positive(),
  durationOptions: z.array(z.object({ durationMinutes: z.number().int().positive(), price: z.number().finite().nonnegative() })).optional(),
  price: z.number().finite().nonnegative(),
  currency: z.string().length(3),
});
export const knowledgeBaseResponseSchema = z.object({
  content: z.string(),
  isCustom: z.boolean(),
  updatedAt: z.string().datetime().optional(),
  services: z.array(knowledgeBaseServiceSchema),
});
export const updateKnowledgeBaseSchema = z.object({ content: knowledgeBaseContentSchema });
export type KnowledgeBaseResponse = z.infer<typeof knowledgeBaseResponseSchema>;
export type UpdateKnowledgeBaseRequest = z.infer<typeof updateKnowledgeBaseSchema>;
