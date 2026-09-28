import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBookingDate } from '../src/booking-date-format.js';

afterEach(() => { vi.unstubAllEnvs(); });

describe('client-facing booking dates', () => {
  it.each([
    ['2026-09-29T16:00:00.000Z', '29 вересня, вівторок, 19:00'],
    ['2026-01-05T07:05:00.000Z', '05 січня, понеділок, 09:05'],
    ['2026-09-29T21:00:00.000Z', '30 вересня, середа, 00:00'],
    ['2026-03-29T00:30:00.000Z', '29 березня, неділя, 02:30'],
    ['2026-03-29T01:30:00.000Z', '29 березня, неділя, 04:30'],
  ])('formats %s in Kyiv local time without timezone labels', (instant, expected) => {
    vi.stubEnv('DEFAULT_TIMEZONE', 'Europe/Kyiv');
    expect(formatBookingDate(instant)).toBe(expected);
  });

  it('uses the configured timezone for both local day and time', () => {
    vi.stubEnv('DEFAULT_TIMEZONE', 'America/New_York');
    expect(formatBookingDate('2026-09-29T01:05:00.000Z')).toBe('28 вересня, понеділок, 21:05');
  });
});
