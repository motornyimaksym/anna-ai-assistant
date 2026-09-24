import { z } from 'zod';

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');
export const bookingStatusSchema = z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show']);
export const calendarSyncStatusSchema = z.enum(['pending', 'synced', 'failed']);
export const serviceSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), description: z.string().max(2_000).default(''),
  durationMinutes: z.number().int().min(15).max(480), bufferMinutes: z.number().int().min(0).max(120),
  price: z.number().nonnegative(), currency: z.string().length(3).default('UAH'), enabled: z.boolean().default(true)
});
export const availabilityRuleSchema = z.object({ id: z.string().min(1), dayOfWeek: z.number().int().min(0).max(6), start: timeSchema, end: timeSchema, enabled: z.boolean().default(true) }).refine((rule) => rule.start < rule.end, 'End must be after start');
export const scheduleExceptionSchema = z.object({ id: z.string().min(1), date: z.string().date(), type: z.enum(['day_off', 'working_interval', 'blocked_interval']), start: timeSchema.optional(), end: timeSchema.optional(), note: z.string().max(500).optional() }).superRefine((value, ctx) => { if (value.type !== 'day_off' && (!value.start || !value.end || value.start >= value.end)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Intervals require a valid start and end' }); });
export const bookingSchema = z.object({
  id: z.string().min(1), clientId: z.string().min(1), serviceId: z.string().min(1), startAt: z.string().datetime(), endAt: z.string().datetime(), status: bookingStatusSchema,
  telegramChatId: z.string().min(1), businessConnectionId: z.string().optional(), googleCalendarEventId: z.string().optional(), calendarSyncStatus: calendarSyncStatusSchema,
  createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});
export const clientSchema = z.object({ telegramUserId: z.string().min(1), username: z.string().optional(), firstName: z.string().min(1), lastName: z.string().optional(), phone: z.string().optional(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
export const createBookingRequestSchema = z.object({ clientId: z.string().min(1), serviceId: z.string().min(1), startAt: z.string().datetime(), telegramChatId: z.string().min(1), businessConnectionId: z.string().optional() });
export const updateBookingRequestSchema = z.object({ status: bookingStatusSchema.optional() });
export const rescheduleBookingRequestSchema = z.object({ startAt: z.string().datetime() });
export const availableSlotsRequestSchema = z.object({ serviceId: z.string().min(1), date: z.string().date(), after: timeSchema.optional(), before: timeSchema.optional() });
export const availableSlotsResponseSchema = z.object({ slots: z.array(z.string().datetime()) });
export const pendingActionSchema = z.object({ name: z.enum(['create_booking', 'cancel_booking', 'reschedule_booking']), arguments: z.record(z.string()), expiresAt: z.string().datetime() });
export const conversationSchema = z.object({ telegramChatId: z.string().min(1), clientId: z.string().optional(), businessConnectionId: z.string().optional(), assistantEnabled: z.boolean(), state: z.string().default('active'), summary: z.string().default(''), pendingAction: pendingActionSchema.optional(), humanTakeoverUntil: z.string().datetime().optional(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
export const patchConversationSchema = z.object({ assistantEnabled: z.boolean().optional(), humanTakeoverUntil: z.string().datetime().nullable().optional() }).refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const telegramToolArgsSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('get_services'), arguments: z.object({}) }),
  z.object({ name: z.literal('get_available_slots'), arguments: availableSlotsRequestSchema }),
  z.object({ name: z.literal('create_booking'), arguments: createBookingRequestSchema }),
  z.object({ name: z.literal('get_bookings'), arguments: z.object({ clientId: z.string().min(1) }) }),
  z.object({ name: z.literal('cancel_booking'), arguments: z.object({ bookingId: z.string().min(1) }) }),
  z.object({ name: z.literal('reschedule_booking'), arguments: z.object({ bookingId: z.string().min(1), startAt: z.string().datetime() }) })
]);
export type ServiceDto = z.infer<typeof serviceSchema>; export type AvailabilityRuleDto = z.infer<typeof availabilityRuleSchema>; export type ScheduleExceptionDto = z.infer<typeof scheduleExceptionSchema>; export type BookingDto = z.infer<typeof bookingSchema>; export type ClientDto = z.infer<typeof clientSchema>; export type ConversationDto = z.infer<typeof conversationSchema>; export type CreateBookingRequest = z.infer<typeof createBookingRequestSchema>; export type UpdateBookingRequest = z.infer<typeof updateBookingRequestSchema>; export type RescheduleBookingRequest = z.infer<typeof rescheduleBookingRequestSchema>; export type AvailableSlotsRequest = z.infer<typeof availableSlotsRequestSchema>; export type AvailableSlotsResponse = z.infer<typeof availableSlotsResponseSchema>;

