import { describe, expect, it } from 'vitest';
import { botSettingsResponseSchema, botSettingsSchema } from './index.js';

describe('bot settings contract', () => {
  it('accepts inclusive configured limits', () => {
    expect(botSettingsSchema.parse({ maxReadDelayMs: 3_540_000, typingDelayPerSymbolMs: 800 })).toEqual({ maxReadDelayMs: 3_540_000, typingDelayPerSymbolMs: 800 });
    expect(botSettingsSchema.parse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0 })).toEqual({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 0 });
  });

  it('rejects fractional and out-of-range settings', () => {
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: -1, typingDelayPerSymbolMs: 600 }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 3_540_001, typingDelayPerSymbolMs: 600 }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 800.5 }).success).toBe(false);
    expect(botSettingsSchema.safeParse({ maxReadDelayMs: 0, typingDelayPerSymbolMs: 801 }).success).toBe(false);
  });

  it('allows settings responses with custom status and timestamp', () => {
    expect(botSettingsResponseSchema.parse({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' }).isCustom).toBe(true);
  });
});
