import { z } from 'zod';
export { defaultServiceCaption, serviceDurationOptions } from './service-presentation.js';

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');
export const bookingStatusSchema = z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show']);
export const calendarSyncStatusSchema = z.enum(['pending', 'synced', 'failed']);
export const telegramMessageEntitySchema = z.object({
  type: z.enum(['bold', 'italic', 'underline', 'strikethrough', 'spoiler', 'code', 'pre', 'text_link', 'blockquote', 'expandable_blockquote']),
  offset: z.number().int().min(0), length: z.number().int().min(1), url: z.string().url().refine((value) => /^(https?:\/\/|tg:\/\/|mailto:|tel:)/i.test(value), 'Unsupported link protocol').optional(), language: z.string().max(64).optional(),
}).superRefine((entity, ctx) => {
  if (entity.type === 'text_link' && !entity.url) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Text links require a URL' });
  if (entity.type !== 'text_link' && entity.url) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Only text links accept a URL' });
  if (entity.type !== 'pre' && entity.language) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['language'], message: 'Only preformatted text accepts a language' });
});
export const telegramCaptionSchema = z.object({ text: z.string().min(1).max(4096), entities: z.array(telegramMessageEntitySchema).max(100).default([]) }).superRefine((caption, ctx) => {
  caption.entities.forEach((entity, index) => {
    if (entity.offset + entity.length > caption.text.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entities', index], message: 'Entity range exceeds the caption text' });
    for (let nextIndex = index + 1; nextIndex < caption.entities.length; nextIndex++) {
      const next = caption.entities[nextIndex]!;
      const entityEnd = entity.offset + entity.length; const nextEnd = next.offset + next.length;
      const intersects = entity.offset < nextEnd && next.offset < entityEnd;
      const nested = (entity.offset <= next.offset && entityEnd >= nextEnd) || (next.offset <= entity.offset && nextEnd >= entityEnd);
      if (intersects && !nested) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entities', nextIndex], message: 'Formatting ranges may nest but may not cross' });
    }
  });
});
export const telegramUrlButtonSchema = z.object({ text: z.string().trim().min(1).max(64), url: z.string().url().max(2048).refine((value) => value.startsWith('https://') || value.startsWith('tg://'), 'Button URL must use HTTPS or Telegram links') });
export const telegramButtonRowsSchema = z.array(z.array(telegramUrlButtonSchema).min(1).max(2)).max(8).optional();
export const serviceDurationOptionSchema = z.object({ durationMinutes: z.number().int().min(15).max(480), price: z.number().finite().nonnegative() });
export const serviceSchema = z.object({
  id: z.string().min(1), name: z.string().trim().min(1).max(120), description: z.string().max(2_000).default(''),
  durationMinutes: z.number().int().min(15).max(480), bufferMinutes: z.number().int().min(0).max(120),
  price: z.number().finite().nonnegative(), durationOptions: z.array(serviceDurationOptionSchema).max(9).optional(), currency: z.string().length(3).default('UAH'), enabled: z.boolean().default(true),
  photoUrl: z.string().url().refine((value) => value.startsWith('https://firebasestorage.googleapis.com/v0/b/'), 'Photo must use the Firebase Storage download URL').optional(), telegramCaption: telegramCaptionSchema.optional(), telegramButtons: telegramButtonRowsSchema,
}).superRefine((service, ctx) => {
  const durations = [service.durationMinutes, ...(service.durationOptions ?? []).map((option) => option.durationMinutes)];
  if (new Set(durations).size !== durations.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['durationOptions'], message: 'Each duration must be unique' });
  if (service.photoUrl && service.telegramCaption && service.telegramCaption.text.length > 1024) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['telegramCaption', 'text'], message: 'Photo captions may be at most 1,024 characters' });
});
export const servicePhotoUploadSchema = z.object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']), base64: z.string().min(1).max(7_000_000) });
export const servicePhotoUploadResponseSchema = z.object({ photoUrl: z.string().url() });
export const availabilityRuleSchema = z.object({ id: z.string().min(1), dayOfWeek: z.number().int().min(0).max(6), start: timeSchema, end: timeSchema, enabled: z.boolean().default(true) }).refine((rule) => rule.start < rule.end, 'End must be after start');
export const scheduleExceptionSchema = z.object({ id: z.string().min(1), date: z.string().date(), type: z.enum(['day_off', 'working_interval', 'blocked_interval']), start: timeSchema.optional(), end: timeSchema.optional(), note: z.string().max(500).optional() }).superRefine((value, ctx) => { if (value.type !== 'day_off' && (!value.start || !value.end || value.start >= value.end)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Intervals require a valid start and end' }); });
export const bookingSchema = z.object({
  durationMinutes: z.number().int().min(15).max(480).optional(), price: z.number().finite().nonnegative().optional(), currency: z.string().length(3).optional(),
  id: z.string().min(1), clientId: z.string().min(1), serviceId: z.string().min(1), startAt: z.string().datetime(), endAt: z.string().datetime(), status: bookingStatusSchema,
  telegramChatId: z.string().min(1), businessConnectionId: z.string().optional(), googleCalendarEventId: z.string().optional(), calendarSyncStatus: calendarSyncStatusSchema,
  createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});
export const clientSchema = z.object({ telegramUserId: z.string().min(1), username: z.string().optional(), firstName: z.string().min(1), lastName: z.string().optional(), phone: z.string().optional(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
export const createBookingRequestSchema = z.object({ durationMinutes: serviceDurationOptionSchema.shape.durationMinutes.optional(), clientId: z.string().min(1), serviceId: z.string().min(1), startAt: z.string().datetime(), telegramChatId: z.string().min(1), businessConnectionId: z.string().optional() });
export const updateBookingRequestSchema = z.object({ status: bookingStatusSchema.optional() });
export const rescheduleBookingRequestSchema = z.object({ startAt: z.string().datetime() });
export const availableSlotsRequestSchema = z.object({ durationMinutes: serviceDurationOptionSchema.shape.durationMinutes.optional(), serviceId: z.string().min(1), date: z.string().date(), after: timeSchema.optional(), before: timeSchema.optional() });
export const availableSlotsResponseSchema = z.object({ slots: z.array(z.string().datetime()) });
export const pendingActionSchema = z.object({ name: z.enum(['create_booking', 'cancel_booking', 'reschedule_booking']), arguments: z.record(z.union([z.string(), z.number().finite()])), expiresAt: z.string().datetime() });
export const conversationSchema = z.object({ telegramChatId: z.string().min(1), clientId: z.string().optional(), businessConnectionId: z.string().optional(), assistantEnabled: z.boolean(), state: z.string().default('active'), summary: z.string().default(''), pendingAction: pendingActionSchema.optional(), humanTakeoverUntil: z.string().datetime().optional(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
export const patchConversationSchema = z.object({ assistantEnabled: z.boolean().optional(), humanTakeoverUntil: z.string().datetime().nullable().optional() }).refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const assistantPromptResponseSchema = z.object({ prompt: z.string(), isCustom: z.boolean(), updatedAt: z.string().datetime().optional() });
export const updateAssistantPromptSchema = z.object({ prompt: z.string().min(1).max(12_000).refine((prompt) => prompt.trim().length > 0, 'Prompt must not be blank') });
export const botSettingsSchema = z.object({ maxReadDelayMs: z.number().int().min(0).max(3_540_000), typingDelayPerSymbolMs: z.number().int().min(0).max(800) });
export const botSettingsResponseSchema = botSettingsSchema.extend({ isCustom: z.boolean(), updatedAt: z.string().datetime().optional() });
export const updateBotSettingsSchema = botSettingsSchema;
const adminAccessEmailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());
const adminAccessEmailsSchema = z.object({ emails: z.array(adminAccessEmailSchema).max(100) });
const uniqueAdminEmails = ({ emails }: { emails: string[] }, ctx: z.RefinementCtx) => {
  if (new Set(emails).size !== emails.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['emails'], message: 'Email addresses must be unique' });
};
export const updateAdminAccessSchema = adminAccessEmailsSchema.superRefine(uniqueAdminEmails);
export const adminAccessResponseSchema = adminAccessEmailsSchema.extend({ canManage: z.boolean(), updatedAt: z.string().datetime().optional() }).superRefine(uniqueAdminEmails);
export const specResponseSchema = z.object({ content: z.string() });
export const telegramToolArgsSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('get_services'), arguments: z.object({}) }),
  z.object({ name: z.literal('get_available_slots'), arguments: availableSlotsRequestSchema }),
  z.object({ name: z.literal('create_booking'), arguments: createBookingRequestSchema }),
  z.object({ name: z.literal('get_bookings'), arguments: z.object({ clientId: z.string().min(1) }) }),
  z.object({ name: z.literal('cancel_booking'), arguments: z.object({ bookingId: z.string().min(1) }) }),
  z.object({ name: z.literal('reschedule_booking'), arguments: z.object({ bookingId: z.string().min(1), startAt: z.string().datetime() }) })
]);
export type ServiceDto = z.infer<typeof serviceSchema>; export type TelegramCaptionDto = z.infer<typeof telegramCaptionSchema>; export type TelegramMessageEntityDto = z.infer<typeof telegramMessageEntitySchema>; export type TelegramUrlButtonDto = z.infer<typeof telegramUrlButtonSchema>; export type AvailabilityRuleDto = z.infer<typeof availabilityRuleSchema>; export type ScheduleExceptionDto = z.infer<typeof scheduleExceptionSchema>; export type BookingDto = z.infer<typeof bookingSchema>; export type ClientDto = z.infer<typeof clientSchema>; export type ConversationDto = z.infer<typeof conversationSchema>; export type CreateBookingRequest = z.infer<typeof createBookingRequestSchema>; export type UpdateBookingRequest = z.infer<typeof updateBookingRequestSchema>; export type RescheduleBookingRequest = z.infer<typeof rescheduleBookingRequestSchema>; export type AvailableSlotsRequest = z.infer<typeof availableSlotsRequestSchema>; export type AvailableSlotsResponse = z.infer<typeof availableSlotsResponseSchema>;
export type AssistantPromptResponse = z.infer<typeof assistantPromptResponseSchema>; export type UpdateAssistantPromptRequest = z.infer<typeof updateAssistantPromptSchema>; export type SpecResponse = z.infer<typeof specResponseSchema>;
export type BotSettings = z.infer<typeof botSettingsSchema>; export type BotSettingsResponse = z.infer<typeof botSettingsResponseSchema>; export type UpdateBotSettingsRequest = z.infer<typeof updateBotSettingsSchema>;
export type AdminAccessResponse = z.infer<typeof adminAccessResponseSchema>; export type UpdateAdminAccessRequest = z.infer<typeof updateAdminAccessSchema>;
export * from './telegram-account.js';
