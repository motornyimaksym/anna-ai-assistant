import { describe, expect, it } from 'vitest';
import { assistantPromptResponseSchema, specResponseSchema, updateAssistantPromptSchema } from '../src/index.js';

describe('admin content contracts', () => {
  it('accepts valid prompt overrides and optional update timestamps', () => {
    expect(updateAssistantPromptSchema.parse({ prompt: 'Be concise.' })).toEqual({ prompt: 'Be concise.' });
    expect(assistantPromptResponseSchema.parse({ prompt: 'Default prompt', isCustom: false })).toEqual({ prompt: 'Default prompt', isCustom: false });
    expect(assistantPromptResponseSchema.parse({ prompt: 'Custom prompt', isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' }).isCustom).toBe(true);
  });

  it('rejects blank and oversized prompt overrides', () => {
    expect(updateAssistantPromptSchema.safeParse({ prompt: ' \n ' }).success).toBe(false);
    expect(updateAssistantPromptSchema.safeParse({ prompt: 'x'.repeat(12_001) }).success).toBe(false);
  });

  it('validates spec content response', () => {
    expect(specResponseSchema.parse({ content: '# Booking assistant' }).content).toBe('# Booking assistant');
    expect(specResponseSchema.safeParse({ content: 12 }).success).toBe(false);
  });
});
