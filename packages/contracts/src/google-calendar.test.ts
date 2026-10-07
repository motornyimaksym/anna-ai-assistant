import { describe, expect, it } from 'vitest';
import { googleCalendarCompleteSchema, googleCalendarSelectionSchema, googleCalendarStatusSchema } from './google-calendar.js';
describe('Calendar authorization contracts', () => {
  it('requires a bounded code or denial and rejects supplied credentials', () => {
    const state = 'a'.repeat(43);
    expect(googleCalendarCompleteSchema.safeParse({ state, code: 'code' }).success).toBe(true);
    expect(googleCalendarCompleteSchema.safeParse({ state, denied: true }).success).toBe(true);
    for (const body of [{ state }, { state, denied: true, code: 'code' }, { state, code: 'code', refreshToken: 'secret' }, { state: 'bad', code: 'code' }]) expect(googleCalendarCompleteSchema.safeParse(body).success).toBe(false);
    expect(googleCalendarSelectionSchema.safeParse({ calendarId: 'primary', redirectUri: 'https://evil.test' }).success).toBe(false);
  });

  it('allows an optional refresh-token expiration timestamp without exposing credentials', () => {
    const base = { configured: true, phase: 'connected' as const, legacy: false };
    expect(googleCalendarStatusSchema.parse(base)).not.toHaveProperty('refreshTokenExpiresAt');
    expect(googleCalendarStatusSchema.parse({ ...base, refreshTokenExpiresAt: '2030-01-02T03:04:05.000Z' })).toHaveProperty('refreshTokenExpiresAt', '2030-01-02T03:04:05.000Z');
    expect(googleCalendarStatusSchema.safeParse({ ...base, refreshTokenExpiresAt: 'tomorrow' }).success).toBe(false);
    expect(googleCalendarStatusSchema.parse({ ...base, refreshToken: 'secret' })).not.toHaveProperty('refreshToken');
  });
});
