import { describe, expect, it } from 'vitest';
import { responseDelayMs } from '../src/response-pacing.js';
describe('assistant response pacing', () => {
  it('waits 600ms per Unicode code point', () => {
    expect(responseDelayMs('Hey 🙂')).toBe(3_000);
    expect(responseDelayMs('')).toBe(0);
  });
});
