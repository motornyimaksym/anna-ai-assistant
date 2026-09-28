import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { DEFAULT_CONVERSATION_GUIDANCE, TELEGRAM_FORMAT_GUIDANCE, THERAPIST_FIRST_PERSON_GUIDANCE } from '../src/assistant-prompt.js';
import { SYSTEM_TWO_PROMPTS } from '../src/system-two.js';
import { probabilityGuidance } from '../src/typesafe-system-one.js';
import { NATURAL_CONFIRMATION_GUIDANCE } from '../src/confirmation-prompt.js';
import { CONTEXT_SECURITY_GUIDANCE, MEDIA_TOOL_GUIDANCE, boundedConversationHistory, systemTwoInstructions, systemTwoRag, systemTwoRequestContext } from '../src/system-two-instructions.js';

describe('System Two prompts', () => {
  const mandatoryGuidance = [THERAPIST_FIRST_PERSON_GUIDANCE, TELEGRAM_FORMAT_GUIDANCE, MEDIA_TOOL_GUIDANCE, NATURAL_CONFIRMATION_GUIDANCE, CONTEXT_SECURITY_GUIDANCE];

  it('preserves the separately imported Probability default', () => {
    const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
    expect(sha256(probabilityGuidance)).toBe('7b0acebec8f1a46f3bb021669f79e1153662cee2bd5e5691241ce9aa5ca45bce');
  });

  it.each(['general', 'booking'] as const)('keeps %s defaults and complete static instructions within their size budgets', (promptId) => {
    const base = SYSTEM_TWO_PROMPTS[promptId].defaultPrompt;
    const instructions = systemTwoInstructions({ promptId });
    expect(base.length).toBeLessThanOrEqual(3_500);
    expect(instructions.length).toBeLessThanOrEqual(6_500);
    expect(base.split(DEFAULT_CONVERSATION_GUIDANCE)).toHaveLength(2);
    for (const section of mandatoryGuidance) {
      expect(base).not.toContain(section);
      expect(instructions.split(section)).toHaveLength(2);
    }
    expect(instructions).not.toContain('Current UTC time:');
  });

  it.each(['general', 'booking'] as const)('preserves custom %s text and appends mandatory workflow guidance exactly once', (promptId) => {
    const promptOverride = 'Custom conversation style from the admin editor.';
    const instructions = systemTwoInstructions({ promptId, promptOverride });
    expect(instructions.startsWith(`${promptOverride}\n\n`)).toBe(true);
    expect(instructions).not.toContain(DEFAULT_CONVERSATION_GUIDANCE);
    expect(instructions.split(SYSTEM_TWO_PROMPTS[promptId].guidance)).toHaveLength(2);
    for (const section of mandatoryGuidance) expect(instructions.split(section)).toHaveLength(2);
  });

  it('keeps runtime data after the static prefix and marks supported cache boundary', () => {
    const instructions = systemTwoInstructions({ promptId: 'booking' });
    const rag = systemTwoRag({ message: 'Чи є доплата після 21:00?', configuredServices: [], now: new Date('2026-09-28T21:00:00.000Z') });
    const context = systemTwoRequestContext({ instructions, rag, history: [{ role: 'assistant', content: 'Previous private answer' }], message: 'Current private question', model: 'gpt-5.6' });
    expect(JSON.stringify(context.input[0])).not.toContain('2026-09-28');
    expect(JSON.stringify(context.input[0])).not.toContain('Current private question');
    expect(context.input[0]).toMatchObject({ role: 'developer', content: [{ prompt_cache_breakpoint: { mode: 'explicit' } }] });
    expect(context.input.slice(1)).toEqual([{ role: 'developer', content: rag }, { role: 'assistant', content: 'Previous private answer' }, { role: 'user', content: 'Current private question' }]);
    expect(context.prompt_cache_options).toEqual({ mode: 'explicit' });
    expect(systemTwoRequestContext({ instructions, rag, history: [], message: 'Hi', model: 'gpt-4o-mini' }).prompt_cache_options).toBeUndefined();
    expect(rag).toContain('доплата');
    expect(rag).not.toContain('МЕЖІ ДОТИКІВ');
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
