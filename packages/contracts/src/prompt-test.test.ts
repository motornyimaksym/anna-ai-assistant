import { describe, expect, it } from 'vitest';
import { promptTestRequestSchema } from './prompt-test.js';

describe('prompt test request', () => {
  it('accepts only matching existing prompt IDs and bounded example text', () => {
    expect(promptTestRequestSchema.parse({ system: 'one', promptId: 'routing', text: ' Hello ' }).text).toBe('Hello');
    expect(promptTestRequestSchema.safeParse({ system: 'one', promptId: 'general', text: 'Hello' }).success).toBe(false);
    expect(promptTestRequestSchema.safeParse({ system: 'one', promptId: 'rejection', text: 'No' }).success).toBe(false);
    expect(promptTestRequestSchema.safeParse({ system: 'two', promptId: 'booking-planner', text: 'Hello' }).success).toBe(false);
    expect(promptTestRequestSchema.safeParse({ system: 'two', promptId: 'booking-planner', intent: 'create', text: 'Hello' }).success).toBe(true);
    expect(promptTestRequestSchema.safeParse({ system: 'two', promptId: 'general', text: ' '.repeat(3) }).success).toBe(false);
    expect(promptTestRequestSchema.safeParse({ system: 'two', promptId: 'general', text: 'x'.repeat(4_001) }).success).toBe(false);
  });
});
