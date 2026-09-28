import type { AssistantPromptId } from '@booking/contracts';
import { ASSISTANT_SYSTEM_PROMPT } from './assistant-prompt.js';
import { HANDOFF_PROMPT } from './handoff-prompt.js';

export const promptDefinitions: Record<AssistantPromptId, { label: string; description: string; defaultPrompt: string }> = {
  handoff: { label: 'Handoff', description: 'Estimates human handoff for knowledge gaps, bot-like wording or booking confirmation. Confirmation must return 100%.', defaultPrompt: HANDOFF_PROMPT },
  assistant: { label: 'Assistant', description: 'Writes all client replies and handles booking dialogue; humans finalize appointments.', defaultPrompt: ASSISTANT_SYSTEM_PROMPT },
};
