import { z } from 'zod';
import type { SystemTwoPromptId } from './system-two.js';

/** Provider-neutral input: deliberately excludes domain records and provider types. */
export type SystemOneInput = {
  message: string;
  summary: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  hasPendingProposal: boolean;
};

export const systemOneDecisionInputSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  context: z.string().min(1).max(100_000),
}).strict();
export type SystemOneDecisionInput = z.infer<typeof systemOneDecisionInputSchema>;
export const systemOneBooleanSchema = z.boolean();
export const systemOneProbabilitySchema = z.number().finite().min(0).max(1);

/** Nest injection token and replaceable routing port. Selection never performs domain actions. */
export abstract class SystemOneSelector {
  abstract answerBoolean(input: SystemOneDecisionInput, signal: AbortSignal): Promise<boolean>;
  abstract estimateProbability(input: SystemOneDecisionInput, signal: AbortSignal): Promise<number>;
  abstract select(input: SystemOneInput, signal: AbortSignal): Promise<SystemTwoPromptId>;
}
