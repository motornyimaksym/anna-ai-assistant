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
    guidance: 'SYSTEM TWO: GENERAL. Answer informational questions using configured facts. No scheduling or booking tools: never switch workflows, promise to check slots, invent availability or stage a booking. If scheduling intent is unclear, ask one focused question. Use request_human_assistance for essential unresolved business facts, not missing client preferences, greetings, thanks or off-topic questions.',
    tools: ['request_human_assistance', 'get_media', 'send_media', 'get_services'],
  },
  booking: {
    description: 'Availability, appointment creation, rescheduling, cancellation, existing bookings, confirmation questions, or a contextual follow-up in a booking flow. Mixed scheduling and informational requests belong here.',
    defaultPrompt: BOOKING_CONVERSATION_PROMPT,
    guidance: 'SYSTEM TWO: BOOKING. For every availability, creation or rescheduling request, call plan_booking; it receives the request, history, catalog, knowledge and live scheduling context separately. Let it ask for missing scheduling details; never invent times or bypass it. Planning clarification/unavailability is a normal response, not grounds for handoff. Use request_human_assistance for essential unresolved business facts or uncertain mutation outcomes, not missing client preferences.',
    tools: ['request_human_assistance', 'get_media', 'send_media', 'get_services', 'get_bookings', 'plan_booking', 'cancel_booking'],
  },
};
