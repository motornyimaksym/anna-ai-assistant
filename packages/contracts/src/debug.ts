import { z } from 'zod';
const short = z.string().max(100);
export const debugRequestSchema = z.object({
  provider: z.enum(['openai', 'typesafe']), operation: short, endpoint: z.string().max(200), method: z.literal('POST'),
  model: short.optional(), conversationAttached: z.boolean(), conversationId: z.string().max(200).optional(), previousResponseId: z.string().max(200).optional(),
  store: z.boolean().optional(), maxOutputTokens: z.number().optional(), attempts: z.number().int().min(0).max(4), durationMs: z.number().nonnegative(),
  httpStatus: z.number().int().optional(), providerRequestId: z.string().max(120).optional(), responseStatus: short.optional(), incompleteReason: short.optional(),
  errorDiagnostic: z.string().max(3000).optional(), usage: z.string().max(2000).optional(), outputTypes: z.array(short).max(20), errorCategory: short.optional(),
  requestBytes: z.number().nonnegative(), responseBytes: z.number().nonnegative(),
  bodyStorageStatus: z.enum(['complete', 'partial', 'unavailable']).optional(),
  requestPreview: z.string().max(16384).optional(), responsePreview: z.string().max(8192).optional(), requestTruncated: z.boolean().optional(), responseTruncated: z.boolean().optional(),
});
export type DebugRequest = z.infer<typeof debugRequestSchema>;
export const debugPayloadSchema = z.object({
  status: z.enum(['complete', 'partial', 'unavailable', 'legacy_preview']),
  requestBody: z.string().optional(), responseBody: z.string().optional(),
  requestTruncated: z.boolean().optional(), responseTruncated: z.boolean().optional(),
});
export type DebugPayload = z.infer<typeof debugPayloadSchema>;
export const debugDetailsSchema = z.object({
  request: debugRequestSchema.optional(),
  status: short.optional(), intent: short.optional(), tool: short.optional(), reason: short.optional(),
  serviceId: short.optional(), startAt: z.string().datetime().optional(), durationMinutes: z.number().optional(),
  responderCount: z.number().optional(), candidateCount: z.number().optional(), messageCount: z.number().optional(), busyCount: z.number().optional(),
  scheduleAgeSeconds: z.number().optional(), sourceStatus: short.optional(), calendarStatus: short.optional(),
  errorCategory: short.optional(), requestId: short.optional(), durationMs: z.number().optional(),
});
export const debugEventSchema = z.object({
  id: z.string().uuid(), createdAt: z.string().datetime(), traceId: z.string().uuid(), chatRef: z.string().max(16),
  stage: z.enum(['provider_request', 'received', 'ignored', 'human_paused', 'jev_decision', 'assistant_started', 'tool_called', 'booking_context', 'booking_result', 'proposal_created', 'confirmation_result', 'handoff', 'reply_sent', 'reply_failed', 'error']),
  level: z.enum(['info', 'warn', 'error']), details: debugDetailsSchema,
});
export const debugAccessSchema = z.object({ canView: z.boolean() });
export const debugEventsSchema = z.array(debugEventSchema).max(200);
export type DebugEvent = z.infer<typeof debugEventSchema>;
export type DebugDetails = z.infer<typeof debugDetailsSchema>;
