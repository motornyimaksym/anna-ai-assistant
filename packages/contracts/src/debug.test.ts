import { expect, it } from 'vitest';
import { debugClearResponseSchema } from './debug.js';

it('accepts the debug log clear response', () => {
  expect(debugClearResponseSchema.parse({ ok: true })).toEqual({ ok: true });
  expect(debugClearResponseSchema.safeParse({ ok: false }).success).toBe(false);
});
