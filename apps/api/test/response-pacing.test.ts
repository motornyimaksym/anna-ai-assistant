import { describe, expect, it } from 'vitest';
import { randomReadDelayMs, responseDelayMs } from '../src/response-pacing.js';
describe('assistant response pacing', () => {
  it('uses configured milliseconds per Unicode code point', () => {
    expect(responseDelayMs('Hey 🙂')).toBe(3_000);
    expect(responseDelayMs('Hey 🙂', 25)).toBe(125);
    expect(responseDelayMs('')).toBe(0);
  });

  it('chooses an inclusive random read delay from zero through the maximum', () => {
    expect(randomReadDelayMs(1000, () => 0)).toBe(0);
    expect(randomReadDelayMs(1000, () => 0.999999)).toBe(1000);
    expect(randomReadDelayMs(0, () => 0.5)).toBe(0);
  });
});
