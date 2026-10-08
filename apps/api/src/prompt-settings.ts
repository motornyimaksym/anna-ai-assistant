import type { AssistantPromptId } from '@booking/contracts';
import { ASSISTANT_SYSTEM_PROMPT } from './assistant-prompt.js';
import { SYSTEM_ONE_REWRITE_PROMPT } from './system-one-rewrite-prompt.js';

export const promptDefinitions: Record<AssistantPromptId, { label: string; description: string; defaultPrompt: string }> = {
  rewrite: { label: 'Reply Rewriter', description: 'Rewrites the outgoing reply using four recent messages and the draft only.', defaultPrompt: SYSTEM_ONE_REWRITE_PROMPT },
  handoff: { label: 'Reply Rewriter', description: 'Legacy alias for the outgoing reply rewrite prompt.', defaultPrompt: SYSTEM_ONE_REWRITE_PROMPT },
  assistant: { label: 'Assistant', description: 'Writes client replies and can create a Calendar booking after explicit confirmation.', defaultPrompt: ASSISTANT_SYSTEM_PROMPT },
};
