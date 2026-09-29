import { describe, expect, it } from 'vitest';
import { botSettingsResponseSchema, botSettingsSchema } from './index.js';

describe('bot settings contract', () => {
  it('accepts inclusive configured limits', () => {
    expect(botSettingsSchema.parse({ maxReadDelayMs: 3_540_000, typingDelayPerSymbolMs: 800, testerUsernames: [] })).toEqual({ maxReadDelayMs: 3_540_000, typingDelayPerSymbolMs: 800, testerUsernames: [] });
    expect(botSettingsSchema.parse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: [] })).toEqual({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: [] });
  });

  it('rejects fractional and out-of-range settings', () => {
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: -1, typingDelayPerSymbolMs: 600, testerUsernames: [] }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 3_540_001, typingDelayPerSymbolMs: 600, testerUsernames: [] }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 800.5, testerUsernames: [] }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 801, testerUsernames: [] }).success).toBe(false);
  });

  it('allows settings responses with custom status and timestamp', () => {
    expect(botSettingsResponseSchema.parse({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [], isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' }).isCustom).toBe(true);
  });

  it('normalizes a bounded unique Telegram tester username list', () => {
    expect(botSettingsSchema.parse({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [' User61785 ', '@Another_User'] })).toEqual({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: ['user61785', 'another_user'] });
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: ['user61785', '@USER61785'] }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: ['bad-name'] }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: Array.from({ length: 21 }, (_, i) => `tester_${String(i).padStart(2, '0')}`) }).success).toBe(false);
  });
});
