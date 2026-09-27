import { z } from 'zod';

export const bookingIntentSchema = z.enum(['availability', 'create', 'reschedule']);
export const bookingPlanRequestSchema = z.object({ intent: bookingIntentSchema, bookingId: z.string().min(1).nullable() }).strict();
export const bookingPlanSchema = z.object({
  status: z.enum(['ready', 'needs_clarification', 'unavailable']),
  serviceId: z.string().min(1).nullable(),
  startAt: z.string().datetime({ offset: true }).nullable(),
  durationMinutes: z.number().int().min(15).max(480).nullable(),
  candidateStarts: z.array(z.string().datetime({ offset: true })).max(10),
  question: z.string().trim().min(1).max(1000).nullable(),
}).strict();
export type BookingPlan = z.infer<typeof bookingPlanSchema>;
export type BookingPlanRequest = z.infer<typeof bookingPlanRequestSchema>;
