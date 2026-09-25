import { z } from 'zod';

export const MEDIA_PHOTO_MAX_BYTES = 5_000_000;
export const MEDIA_VIDEO_MAX_BYTES = 20_000_000;
export const mediaIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const mediaMetadataSchema = z.object({
  description: z.string().trim().min(1).max(2000),
  debounceSeconds: z.number().int().min(0).max(31_536_000).default(86_400),
  enabled: z.boolean().default(true),
});
export const mediaFileSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(['image/jpeg', 'image/png', 'video/mp4']),
  base64: z.string().min(4).max(Math.ceil(MEDIA_VIDEO_MAX_BYTES / 3) * 4),
}).strict();
export const createMediaSchema = mediaMetadataSchema.extend({ file: mediaFileSchema }).strict();
export const updateMediaSchema = mediaMetadataSchema.partial().extend({ file: mediaFileSchema.optional() }).strict().refine((value) => Object.keys(value).length > 0, 'No changes supplied');
export const mediaSchema = mediaMetadataSchema.extend({
  id: mediaIdSchema, kind: z.enum(['photo', 'video']), filename: z.string(),
  contentType: mediaFileSchema.shape.contentType, sizeBytes: z.number().int().positive(),
  url: z.string().url(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export const mediaDeleteResponseSchema = z.object({ ok: z.literal(true) });
export type MediaDto = z.infer<typeof mediaSchema>;
export type MediaFileInput = z.infer<typeof mediaFileSchema>;
export type CreateMediaInput = z.input<typeof createMediaSchema>;
export type UpdateMediaInput = z.input<typeof updateMediaSchema>;
