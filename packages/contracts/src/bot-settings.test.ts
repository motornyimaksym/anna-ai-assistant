import { describe, expect, it } from 'vitest';
import { botSettingsResponseSchema, botSettingsSchema, promptCatalogResponseSchema, updateBotSettingsSchema } from './index.js';

describe('bot settings contract', () => {
  it('accepts inclusive configured limits', () => {
    expect(botSettingsSchema.parse({ maxReadDelayMs: 3_540_000, typingDelayPerSymbolMs: 800, testerUsernames: [], allUsersEnabled: true, responseVersion: 'v2' })).toEqual({ maxReadDelayMs: 3_540_000, typingDelayPerSymbolMs: 800, testerUsernames: [], allUsersEnabled: true, responseVersion: 'v2' });
    expect(botSettingsSchema.parse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: [], allUsersEnabled: false, responseVersion: 'v1' })).toEqual({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: [], allUsersEnabled: false, responseVersion: 'v1' });
  });

  it('rejects fractional and out-of-range settings', () => {
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: -1, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, responseVersion: 'v1' }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 3_540_001, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, responseVersion: 'v1' }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 800.5, testerUsernames: [], allUsersEnabled: false, responseVersion: 'v1' }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 801, testerUsernames: [], allUsersEnabled: false, responseVersion: 'v1' }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: [], allUsersEnabled: false, responseVersion: 'v3' }).success).toBe(false);
  });

  it('allows settings responses with custom status and timestamp', () => {
    expect(botSettingsResponseSchema.parse({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, responseVersion: 'v1', isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' }).isCustom).toBe(true);
  });

  it('normalizes a bounded unique Telegram tester username list', () => {
    expect(botSettingsSchema.parse({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [' User61785 ', '@Another_User'], allUsersEnabled: false, responseVersion: 'v2' })).toEqual({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: ['user61785', 'another_user'], allUsersEnabled: false, responseVersion: 'v2' });
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: ['user61785', '@USER61785'], allUsersEnabled: false, responseVersion: 'v1' }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: ['bad-name'], allUsersEnabled: false, responseVersion: 'v1' }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0, testerUsernames: Array.from({ length: 21 }, (_, i) => `tester_${String(i).padStart(2, '0')}`), allUsersEnabled: false, responseVersion: 'v1' }).success).toBe(false);
  });
});

it('requires the all-users flag in responses but preserves it when an older update omits it', () => {
  const legacy = { maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [] };
  expect(botSettingsResponseSchema.safeParse({ ...legacy, allUsersEnabled: false, isCustom: false }).success).toBe(false);
  expect(updateBotSettingsSchema.parse(legacy)).toEqual(legacy);
  expect(updateBotSettingsSchema.parse({ ...legacy, allUsersEnabled: true })).toEqual({ ...legacy, allUsersEnabled: true });
  expect(updateBotSettingsSchema.safeParse({ ...legacy, allUsersEnabled: 'true' }).success).toBe(false);
  expect(updateBotSettingsSchema.parse({ ...legacy, responseVersion: 'v2' })).toEqual({ ...legacy, responseVersion: 'v2' });
  expect(updateBotSettingsSchema.safeParse({ ...legacy, responseVersion: 'v3' }).success).toBe(false);
});

it('requires a separate V2 prompt catalog entry for read-only prompt inspection', () => {
  expect(promptCatalogResponseSchema.parse({ systemOne: [], systemTwo: [], systemTwoV2: [{ id: 'assistant-v2', label: 'Assistant v2', description: 'Archive search', content: 'Prompt with $link' }] }).systemTwoV2[0]?.content).toContain('$link');
});
