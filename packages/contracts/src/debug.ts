import { z } from 'zod';
const short = z.string().max(100);
export const debugDetailsSchema = z.object({
  status: short.optional(), intent: short.optional(), tool: short.optional(), reason: short.optional(),
  serviceId: short.optional(), startAt: z.string().datetime().optional(), durationMinutes: z.number().optional(),
  responderCount: z.number().optional(), candidateCount: z.number().optional(), messageCount: z.number().optional(), busyCount: z.number().optional(),
  scheduleAgeSeconds: z.number().optional(), sourceStatus: short.optional(), calendarStatus: short.optional(),
  errorCategory: short.optional(), requestId: short.optional(), durationMs: z.number().optional(),
});
export const debugEventSchema = z.object({
  id: z.string().uuid(), createdAt: z.string().datetime(), traceId: z.string().uuid(), chatRef: z.string().max(16),
  stage: z.enum(['received', 'ignored', 'human_paused', 'jev_decision', 'assistant_started', 'tool_called', 'booking_context', 'booking_result', 'proposal_created', 'confirmation_result', 'handoff', 'reply_sent', 'reply_failed', 'error']),
  level: z.enum(['info', 'warn', 'error']), details: debugDetailsSchema,
});
export const debugAccessSchema = z.object({ canView: z.boolean() });
export const debugEventsSchema = z.array(debugEventSchema).max(200);
export type DebugEvent = z.infer<typeof debugEventSchema>;
export type DebugDetails = z.infer<typeof debugDetailsSchema>;
