import type { AssistantPromptId } from '@booking/contracts';
import { ASSISTANT_SYSTEM_PROMPT } from './assistant-prompt.js';
import { BOOKING_SYSTEM_PROMPT } from './booking-prompt.js';
import { APPROVAL_QUESTION } from './confirmation-prompt.js';
import { SYSTEM_TWO_PROMPTS } from './system-two.js';
import { routingGuidance, probabilityGuidance } from './typesafe-system-one.js';

export const promptDefinitions: Record<AssistantPromptId, { label: string; description: string; defaultPrompt: string }> = {
  routing: { label: 'Routing', description: 'Selects General or Booking for each client message.', defaultPrompt: routingGuidance },
  approval: { label: 'Approval', description: 'Checks explicit approval of the pending proposal.', defaultPrompt: APPROVAL_QUESTION },
  probability: { label: 'Probability', description: 'Checks whether each automatic client reply will be recognized as a bot answer.', defaultPrompt: probabilityGuidance },
  general: { label: 'General', description: 'Answers informational client questions.', defaultPrompt: ASSISTANT_SYSTEM_PROMPT },
  'booking-conversation': { label: 'Booking conversation', description: 'Collects booking intent and delegates schedule checks to the planner.', defaultPrompt: SYSTEM_TWO_PROMPTS.booking.defaultPrompt },
  'booking-planner': { label: 'Booking planner', description: 'Produces a structured plan from schedule and Calendar context.', defaultPrompt: BOOKING_SYSTEM_PROMPT },
};
