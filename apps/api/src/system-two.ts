import { z } from 'zod';
import { ASSISTANT_SYSTEM_PROMPT } from './assistant-prompt.js';
import { BOOKING_CONVERSATION_PROMPT } from './booking-conversation-prompt.js';

export const systemTwoPromptIdSchema = z.enum(['general', 'booking']);
export type SystemTwoPromptId = z.infer<typeof systemTwoPromptIdSchema>;

type PromptDefinition = {
  description: string;
  defaultPrompt: string;
  guidance: string;
  tools: readonly string[];
};

/** Code-owned routing catalog. Each entry is a complete System Two workflow. */
export const SYSTEM_TWO_PROMPTS: Record<SystemTwoPromptId, PromptDefinition> = {
  general: {
    description: 'Greetings, service information, prices, location, policies, preparation, and unrelated questions without a scheduling request.',
    defaultPrompt: ASSISTANT_SYSTEM_PROMPT,
    guidance: 'SYSTEM TWO: GENERAL. Answer informational questions using configured facts. This workflow has no scheduling or booking tools. Do not select another prompt, invent availability, stage a booking, or claim any booking operation succeeded. When scheduling context is unclear, ask one focused clarification. For essential unknown business facts, use request_human_assistance.',
    tools: ['request_human_assistance', 'get_media', 'send_media', 'get_services'],
  },
  booking: {
    description: 'Availability, appointment creation, rescheduling, cancellation, existing bookings, confirmation questions, or a contextual follow-up in a booking flow. Mixed scheduling and informational requests belong here.',
    defaultPrompt: BOOKING_CONVERSATION_PROMPT,
    guidance: 'For every availability, booking creation, or rescheduling question, call plan_booking. It receives the independently editable Booking prompt, schedule and Calendar context separately. Never invent times or bypass the planner. Planning clarification/unavailability is a normal client response, not grounds for human handoff. For other essential unknown facts or uncertain mutation outcomes, call request_human_assistance.',
    tools: ['request_human_assistance', 'get_media', 'send_media', 'get_services', 'get_bookings', 'plan_booking', 'cancel_booking'],
  },
};
