import { describe, expect, it } from 'vitest';
import { promptTestRequestSchema } from './prompt-test.js';
import { assistantPromptIdSchema } from './index.js';
describe('unified prompt contracts', () => {
  it('exposes only Handoff and Assistant', () => {
    expect(assistantPromptIdSchema.options).toEqual(['handoff', 'assistant']);
    expect(promptTestRequestSchema.parse({ system: 'one', promptId: 'handoff', text: 'Так' })).toBeDefined();
    expect(promptTestRequestSchema.parse({ system: 'two', promptId: 'assistant', text: 'Ціна?' })).toBeDefined();
  });
  it('rejects removed prompts and mismatched systems', () => {
    for (const promptId of ['routing', 'approval', 'probability', 'general', 'booking-conversation', 'booking-planner']) {
      for (const system of ['one', 'two']) expect(promptTestRequestSchema.safeParse({ system, promptId, text: 'Example' }).success).toBe(false);
    }
    expect(promptTestRequestSchema.safeParse({ system: 'one', promptId: 'assistant', text: 'Example' }).success).toBe(false);
    expect(promptTestRequestSchema.safeParse({ system: 'two', promptId: 'assistant', text: ' ' }).success).toBe(false);
  });
});
