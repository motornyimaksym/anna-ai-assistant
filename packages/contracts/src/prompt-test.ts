import { z } from 'zod';

const exampleText = z.string().trim().min(1).max(4_000);
export const promptTestRequestSchema = z.discriminatedUnion('system', [
  z.object({ system: z.literal('one'), promptId: z.literal('handoff'), text: exampleText }).strict(),
  z.object({ system: z.literal('two'), promptId: z.literal('assistant'), text: exampleText }).strict(),
]);
export const promptTestResponseSchema = z.object({ kind: z.enum(['decision', 'text', 'tool_calls', 'plan']), output: z.string().max(12_000), sampleContext: z.boolean() }).strict();
export type PromptTestRequest = z.infer<typeof promptTestRequestSchema>;
export type PromptTestResponse = z.infer<typeof promptTestResponseSchema>;
