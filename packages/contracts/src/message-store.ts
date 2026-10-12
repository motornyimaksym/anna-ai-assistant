import { z } from 'zod';

export const messageStoreIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const messageStoreEntitySchema = z.object({
  type: z.enum(['bold', 'italic', 'underline', 'strikethrough', 'spoiler', 'code', 'pre', 'text_link', 'blockquote', 'expandable_blockquote']),
  offset: z.number().int().min(0),
  length: z.number().int().min(1),
  url: z.string().url().refine((value) => /^(https?:\/\/|tg:\/\/|mailto:|tel:)/i.test(value), 'Unsupported link protocol').optional(),
  language: z.string().max(64).optional(),
}).strict().superRefine((entity, ctx) => {
  if (entity.type === 'text_link' && !entity.url) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Text links require a URL' });
  if (entity.type !== 'text_link' && entity.url) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Only text links accept a URL' });
  if (entity.type !== 'pre' && entity.language) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['language'], message: 'Only preformatted text accepts a language' });
});
export const messageStoreEntitiesSchema = z.array(messageStoreEntitySchema).max(100);
const messageStoreFields = z.object({
  description: z.string().trim().min(1).max(2_000),
  text: z.string().min(1).max(4_000).refine((text) => text.trim().length > 0, 'Message must not be blank'),
  entities: messageStoreEntitiesSchema.optional(),
  enabled: z.boolean().default(true),
}).strict();
const validateMessageEntities = (value: { text: string; entities?: z.infer<typeof messageStoreEntitiesSchema> }, ctx: z.RefinementCtx) => {
  const entities = value.entities ?? [];
  entities.forEach((entity, index) => {
    if (entity.offset + entity.length > value.text.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entities', index], message: 'Entity range exceeds the message text' });
    for (let nextIndex = index + 1; nextIndex < entities.length; nextIndex++) {
      const next = entities[nextIndex]!;
      const end = entity.offset + entity.length;
      const nextEnd = next.offset + next.length;
      const intersects = entity.offset < nextEnd && next.offset < end;
      const nested = (entity.offset <= next.offset && end >= nextEnd) || (next.offset <= entity.offset && nextEnd >= end);
      if (intersects && !nested) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entities', nextIndex], message: 'Formatting ranges may nest but may not cross' });
    }
  });
};
export const messageStoreMetadataSchema = messageStoreFields.superRefine(validateMessageEntities);
export const createMessageStoreSchema = messageStoreMetadataSchema;
export const updateMessageStoreSchema = messageStoreFields.partial().strict().refine((value) => Object.keys(value).length > 0, 'No changes supplied');
export const messageStoreSchema = messageStoreFields.extend({
  entities: messageStoreEntitiesSchema.default([]),
  id: messageStoreIdSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict().superRefine(validateMessageEntities);
export const messageStoreDeleteResponseSchema = z.object({ ok: z.literal(true) }).strict();
export const messageStoreImportResponseSchema = z.object({ imported: z.number().int().nonnegative(), existing: z.number().int().nonnegative() }).strict();
export type MessageStoreEntityDto = z.infer<typeof messageStoreEntitySchema>;
export type MessageStoreDto = z.infer<typeof messageStoreSchema>;
export type CreateMessageStoreInput = z.input<typeof createMessageStoreSchema>;
export type UpdateMessageStoreInput = z.input<typeof updateMessageStoreSchema>;
