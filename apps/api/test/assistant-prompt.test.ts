import { HANDOFF_PROMPT } from '../src/handoff-prompt.js';
import { describe, expect, it } from 'vitest';
import { ASSISTANT_SYSTEM_PROMPT, BOOKING_GUIDANCE, DEFAULT_CONVERSATION_GUIDANCE, TELEGRAM_FORMAT_GUIDANCE, THERAPIST_FIRST_PERSON_GUIDANCE } from '../src/assistant-prompt.js';
import { BOOKING_APPROVAL_GUIDANCE, BOOKING_FACTS_GUIDANCE, CONTEXT_SECURITY_GUIDANCE, CUSTOM_SERVICE_HANDOFF_GUIDANCE, MEDIA_TOOL_GUIDANCE, boundedConversationHistory, systemTwoInstructions, systemTwoRag, systemTwoRequestContext } from '../src/system-two-instructions.js';

describe('System Two prompts', () => {
  const mandatoryGuidance = [THERAPIST_FIRST_PERSON_GUIDANCE, TELEGRAM_FORMAT_GUIDANCE, BOOKING_FACTS_GUIDANCE, BOOKING_APPROVAL_GUIDANCE, MEDIA_TOOL_GUIDANCE, CUSTOM_SERVICE_HANDOFF_GUIDANCE, CONTEXT_SECURITY_GUIDANCE];

  it('merges conversation and booking instructions with mandatory constraints on overrides', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain(DEFAULT_CONVERSATION_GUIDANCE);
    expect(ASSISTANT_SYSTEM_PROMPT).toContain(BOOKING_GUIDANCE);
    for (const input of [{}, { promptOverride: 'Custom style' }]) {
      const instructions = systemTwoInstructions(input);
      expect(instructions).toContain(BOOKING_GUIDANCE);
      expect(instructions).toContain(BOOKING_FACTS_GUIDANCE);
      expect(instructions).toContain(BOOKING_APPROVAL_GUIDANCE);
      for (const section of mandatoryGuidance) expect(instructions.split(section)).toHaveLength(2);
      expect(instructions).not.toContain('plan_booking');
    }
  });
  it('keeps runtime data after the static prefix and marks supported cache boundary', () => {
    const instructions = systemTwoInstructions({});
    const rag = systemTwoRag({ message: 'Чи є доплата після 21:00?', configuredServices: [], now: new Date('2026-09-28T21:00:00.000Z') });
    const context = systemTwoRequestContext({ instructions, rag, history: [{ role: 'assistant', content: 'Previous private answer' }], message: 'Current private question', model: 'gpt-5.6' });
    expect(JSON.stringify(context.input[0])).not.toContain('2026-09-28');
    expect(JSON.stringify(context.input[0])).not.toContain('Current private question');
    expect(context.input[0]).toMatchObject({ role: 'developer', content: [{ prompt_cache_breakpoint: { mode: 'explicit' } }] });
    expect(context.input.slice(1)).toEqual([{ role: 'developer', content: rag }, { role: 'assistant', content: 'Previous private answer' }, { role: 'user', content: 'Current private question' }]);
    expect(context.prompt_cache_options).toEqual({ mode: 'explicit' });
    expect(systemTwoRequestContext({ instructions, rag, history: [], message: 'Hi', model: 'gpt-4o-mini' }).prompt_cache_options).toBeUndefined();
    expect(rag).toContain('доплата');
    expect(rag).toContain('МЕЖІ ДОТИКІВ');
  });

  it('bounds recent conversation text while retaining newest turns', () => {
    const history = Array.from({ length: 20 }, (_, index) => ({ role: 'user' as const, content: `${index}:${'x'.repeat(3998)}` }));
    const bounded = boundedConversationHistory(history, 19);
    expect(bounded.at(-1)?.content).toBe(history.at(-1)?.content);
    expect(bounded.reduce((sum, item) => sum + item.content.length, 0)).toBeLessThanOrEqual(12_000);
    expect(bounded[0]?.content).not.toContain('0:');
  });

  it('retrieves eligibility conditions for restricted services', () => {
    const rag = systemTwoRag({ message: 'Хочу боді масаж, можна записатися?', configuredServices: [] });
    expect(rag).toContain('лише клієнтам, які вже були');
    expect(rag).toContain('Майбутній або скасований запис');
  });
});

it('checks one bot-like condition and permits copied text', () => {
  expect(HANDOFF_PROMPT).toContain('one probability');
  expect(HANDOFF_PROMPT).toContain('copy-paste');
  expect(HANDOFF_PROMPT).toContain('Do not assess');
  expect(ASSISTANT_SYSTEM_PROMPT).toContain('neither confirm nor deny');
  expect(ASSISTANT_SYSTEM_PROMPT).toContain('outside the knowledge base');
  expect(BOOKING_GUIDANCE).toContain('create_booking');
  expect(BOOKING_GUIDANCE).toContain('phrase and order the sentence naturally');
  expect(BOOKING_GUIDANCE).toContain('semantically in context');
  expect(BOOKING_GUIDANCE).toContain('Do not require a fixed phrase');
  expect(BOOKING_GUIDANCE).not.toContain('verbatim');
  expect(BOOKING_FACTS_GUIDANCE).toContain('Preserve these values');
  expect(BOOKING_APPROVAL_GUIDANCE).toContain('create_booking');
  expect(BOOKING_APPROVAL_GUIDANCE).toContain('do not require a fixed phrase or phrase whitelist');
  expect(ASSISTANT_SYSTEM_PROMPT).not.toContain('Use regular hyphens.');
  expect(ASSISTANT_SYSTEM_PROMPT).toContain('request_human_assistance');
  expect(ASSISTANT_SYSTEM_PROMPT).toContain('If orgasm happens, it can be a sign');
  expect(CUSTOM_SERVICE_HANDOFF_GUIDANCE).toContain('unrelated to sexual acts');
});
