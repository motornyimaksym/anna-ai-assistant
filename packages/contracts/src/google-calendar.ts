import { z } from 'zod';
export const googleCalendarStatusSchema = z.object({
  writePermission: z.enum(['granted', 'missing', 'unknown']).optional(), conflictCalendarIds: z.array(z.string()).max(20).optional(),
  configured: z.boolean(), phase: z.enum(['disconnected', 'pending', 'connected']), legacy: z.boolean(),
  email: z.string().optional(), calendarId: z.string().optional(), calendarTitle: z.string().optional(), checkedAt: z.string().datetime().optional(), refreshTokenExpiresAt: z.string().datetime().optional(),
});
export const googleCalendarStartSchema = z.object({ url: z.string().url() });
export const googleCalendarCompleteSchema = z.object({ state: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code: z.string().min(1).max(4096).optional(), denied: z.boolean().optional() }).strict().refine((value) => (!!value.code && !value.denied) || (!value.code && value.denied === true), 'Provide code or denial');
export const googleCalendarSelectionSchema = z.object({ calendarId: z.string().min(1).max(1024) }).strict();
export const googleCalendarListSchema = z.array(z.object({ id: z.string().min(1), title: z.string(), primary: z.boolean(), writable: z.boolean().optional() })).max(1000);
export type GoogleCalendarStatus = z.infer<typeof googleCalendarStatusSchema>;
export type GoogleCalendarChoice = z.infer<typeof googleCalendarListSchema>[number];

export const googleCalendarConflictsSchema = z.object({ calendarIds: z.array(z.string().min(1).max(1024)).min(1).max(20) }).strict();
