import { describe, expect, it } from 'vitest';
import { knowledgeBaseResponseSchema, updateKnowledgeBaseSchema } from './knowledge-base.js';

describe('knowledge base contracts', () => {
  it('accepts bounded nonblank content and exposes live services', () => {
    expect(updateKnowledgeBaseSchema.parse({ content: 'Studio is upstairs.' })).toEqual({ content: 'Studio is upstairs.' });
    expect(knowledgeBaseResponseSchema.parse({ content: '', isCustom: false, services: [{ id: 'relax', name: 'Relax', description: '', durationMinutes: 60, price: 1500, currency: 'UAH' }] }).services).toHaveLength(1);
  });
  it('rejects blank and oversized custom knowledge', () => {
    expect(updateKnowledgeBaseSchema.safeParse({ content: '  ' }).success).toBe(false);
    expect(updateKnowledgeBaseSchema.safeParse({ content: 'x'.repeat(12_001) }).success).toBe(false);
  });
});
