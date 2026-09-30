import { z } from 'zod';

export const systemOneDecisionInputSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  context: z.string().min(1).max(100_000),
}).strict();
export type SystemOneDecisionInput = z.infer<typeof systemOneDecisionInputSchema>;
export const systemOneProbabilitySchema = z.number().finite().min(0).max(1);

/** One isolated handoff assessment; never authorizes domain operations. */
export abstract class SystemOneSelector {
  abstract estimateProbability(input: SystemOneDecisionInput, signal: AbortSignal): Promise<number>;
}
