import { describe, expect, it } from 'vitest';
import { ASSISTANT_SYSTEM_PROMPT, TELEGRAM_FORMAT_GUIDANCE, THERAPIST_FIRST_PERSON_GUIDANCE } from '../src/assistant-prompt.js';
import { systemTwoInstructions } from '../src/system-two-instructions.js';

describe('default General prompt', () => {
  it('keeps concise shared guidance without business facts or repeated server guidance', () => {
    expect(ASSISTANT_SYSTEM_PROMPT.length).toBeLessThan(12_000);
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('Ukrainian');
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('lingam');
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('medical');
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('unlisted sexual acts');
    expect(ASSISTANT_SYSTEM_PROMPT).not.toContain('1500 грн');
    expect(ASSISTANT_SYSTEM_PROMPT).not.toContain('plan_booking');
    expect(ASSISTANT_SYSTEM_PROMPT).not.toContain(TELEGRAM_FORMAT_GUIDANCE);
    expect(ASSISTANT_SYSTEM_PROMPT).not.toContain(THERAPIST_FIRST_PERSON_GUIDANCE);
  });

  it('appends each mandatory guidance section once for General and Booking', () => {
    for (const promptId of ['general', 'booking'] as const) {
      const instructions = systemTwoInstructions({ promptId, configuredServices: [], now: new Date('2026-09-27T12:00:00.000Z') });
      expect(instructions.split(THERAPIST_FIRST_PERSON_GUIDANCE)).toHaveLength(2);
      expect(instructions.split(TELEGRAM_FORMAT_GUIDANCE)).toHaveLength(2);
      expect(instructions).toContain('Business knowledge base JSON:');
    }
  });
});
