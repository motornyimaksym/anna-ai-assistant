import { describe, expect, it } from 'vitest';
import { telegramAccountCodeSchema, telegramAccountPasswordSchema, telegramAccountStartSchema, telegramAccountStatusSchema } from './telegram-account.js';
describe('Telegram account contracts', () => {
  it('accepts international numbers and rejects unknown fields', () => {
    expect(telegramAccountStartSchema.parse({ phone: ' +380501234567 ' }).phone).toBe('+380501234567');
    for (const phone of ['0501234567', '+0', '+1abcdefghi']) expect(telegramAccountStartSchema.safeParse({ phone }).success).toBe(false);
    expect(telegramAccountStartSchema.safeParse({ phone: '+380501234567', session: 'secret' }).success).toBe(false);
  });
  it('validates codes and preserves password whitespace', () => {
    expect(telegramAccountCodeSchema.safeParse({ code: 'abc' }).success).toBe(false);
    expect(telegramAccountPasswordSchema.parse({ password: ' secret ' }).password).toBe(' secret ');
    expect(telegramAccountPasswordSchema.safeParse({ password: '' }).success).toBe(false);
  });
  it('strips sensitive fields from public state', () => {
    expect(telegramAccountStatusSchema.parse({ configured: true, phase: 'connected', session: 'secret', phone: '+380501234567' })).toEqual({ configured: true, phase: 'connected' });
  });
});
