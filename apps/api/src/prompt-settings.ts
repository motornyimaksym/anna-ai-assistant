import type { AssistantPromptId } from '@booking/contracts';
import { ASSISTANT_SYSTEM_PROMPT } from './assistant-prompt.js';
import { HANDOFF_PROMPT } from './handoff-prompt.js';

export const promptDefinitions: Record<AssistantPromptId, { label: string; description: string; defaultPrompt: string }> = {
  handoff: { label: 'Handoff', description: 'Estimates whether the outgoing reply sounds automated, using the latest 20 messages and allowing copied text.', defaultPrompt: HANDOFF_PROMPT },
  assistant: { label: 'Assistant', description: 'Writes client replies and can create a Calendar booking after explicit confirmation.', defaultPrompt: ASSISTANT_SYSTEM_PROMPT },
};
