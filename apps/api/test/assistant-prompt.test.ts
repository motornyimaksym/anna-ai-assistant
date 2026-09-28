import { describe, expect, it } from 'vitest';
import { ASSISTANT_SYSTEM_PROMPT, BOOKING_GUIDANCE, DEFAULT_CONVERSATION_GUIDANCE, TELEGRAM_FORMAT_GUIDANCE, THERAPIST_FIRST_PERSON_GUIDANCE } from '../src/assistant-prompt.js';
import { CONTEXT_SECURITY_GUIDANCE, MEDIA_TOOL_GUIDANCE, boundedConversationHistory, systemTwoInstructions, systemTwoRag, systemTwoRequestContext } from '../src/system-two-instructions.js';

describe('System Two prompts', () => {
  const mandatoryGuidance = [THERAPIST_FIRST_PERSON_GUIDANCE, TELEGRAM_FORMAT_GUIDANCE, MEDIA_TOOL_GUIDANCE, CONTEXT_SECURITY_GUIDANCE];

  it('merges conversation and booking instructions with mandatory constraints on overrides', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain(DEFAULT_CONVERSATION_GUIDANCE);
    expect(ASSISTANT_SYSTEM_PROMPT).toContain(BOOKING_GUIDANCE);
    for (const input of [{}, { promptOverride: 'Custom style' }]) {
      const instructions = systemTwoInstructions(input);
      expect(instructions).toContain(BOOKING_GUIDANCE);
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
