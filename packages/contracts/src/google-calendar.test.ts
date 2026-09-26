import { describe, expect, it } from 'vitest';
import { googleCalendarCompleteSchema, googleCalendarSelectionSchema } from './google-calendar.js';
describe('Calendar authorization contracts', () => {
  it('requires a bounded code or denial and rejects supplied credentials', () => {
    const state = 'a'.repeat(43);
    expect(googleCalendarCompleteSchema.safeParse({ state, code: 'code' }).success).toBe(true);
    expect(googleCalendarCompleteSchema.safeParse({ state, denied: true }).success).toBe(true);
    for (const body of [{ state }, { state, denied: true, code: 'code' }, { state, code: 'code', refreshToken: 'secret' }, { state: 'bad', code: 'code' }]) expect(googleCalendarCompleteSchema.safeParse(body).success).toBe(false);
    expect(googleCalendarSelectionSchema.safeParse({ calendarId: 'primary', redirectUri: 'https://evil.test' }).success).toBe(false);
  });
});
