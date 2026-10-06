import { describe, expect, it } from 'vitest';
import { botSettingsResponseSchema, botSettingsSchema, updateBotSettingsSchema } from './index.js';

describe('bot settings contract', () => {
  it('accepts inclusive configured limits', () => {
    expect(botSettingsSchema.parse({ maxReadDelayMs: 3_540_000, typingDelayPerSymbolMs: 800, testerUsernames: [], allUsersEnabled: true })).toEqual({ maxReadDelayMs: 3_540_000, typingDelayPerSymbolMs: 800, testerUsernames: [], allUsersEnabled: true });
    expect(botSettingsSchema.parse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: [], allUsersEnabled: false })).toEqual({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: [], allUsersEnabled: false });
  });

  it('rejects fractional and out-of-range settings', () => {
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: -1, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 3_540_001, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 800.5, testerUsernames: [], allUsersEnabled: false }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 801, testerUsernames: [], allUsersEnabled: false }).success).toBe(false);
  });

  it('allows settings responses with custom status and timestamp', () => {
    expect(botSettingsResponseSchema.parse({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' }).isCustom).toBe(true);
  });

  it('normalizes a bounded unique Telegram tester username list', () => {
    expect(botSettingsSchema.parse({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [' User61785 ', '@Another_User'], allUsersEnabled: false })).toEqual({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: ['user61785', 'another_user'], allUsersEnabled: false });
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: ['user61785', '@USER61785'], allUsersEnabled: false }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: ['bad-name'], allUsersEnabled: false }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: Array.from({ length: 21 }, (_, i) => `tester_${String(i).padStart(2, '0')}`), allUsersEnabled: false }).success).toBe(false);
  });
});

it('requires the all-users flag in responses but preserves it when an older update omits it', () => {
  const legacy = { maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [] };
  expect(botSettingsResponseSchema.safeParse({ ...legacy, isCustom: false }).success).toBe(false);
  expect(updateBotSettingsSchema.parse(legacy)).toEqual(legacy);
  expect(updateBotSettingsSchema.parse({ ...legacy, allUsersEnabled: true })).toEqual({ ...legacy, allUsersEnabled: true });
  expect(updateBotSettingsSchema.safeParse({ ...legacy, allUsersEnabled: 'true' }).success).toBe(false);
});
