import { describe, expect, it } from 'vitest';
import { humanReplySchema, updateHumanAssistanceSettingsSchema } from './human-assistance.js';

describe('human assistance contracts', () => {
  it('normalizes and validates responder usernames', () => {
    expect(updateHumanAssistanceSettingsSchema.parse({ thresholdPercent: 60, usernames: [' @Alice_1 '] })).toEqual({ thresholdPercent: 60, usernames: ['alice_1'] });
    expect(updateHumanAssistanceSettingsSchema.safeParse({ thresholdPercent: 101, usernames: [] }).success).toBe(false);
    expect(updateHumanAssistanceSettingsSchema.safeParse({ thresholdPercent: 60, usernames: ['Alice_1', '@alice_1'] }).success).toBe(false);
    expect(updateHumanAssistanceSettingsSchema.safeParse({ thresholdPercent: 60, usernames: ['bad-name'] }).success).toBe(false);
  });
  it('limits human replies to Telegram text size', () => {
    expect(humanReplySchema.parse({ text: ' Answer ' }).text).toBe('Answer');
    expect(humanReplySchema.safeParse({ text: ' ' }).success).toBe(false);
    expect(humanReplySchema.safeParse({ text: 'a'.repeat(4001) }).success).toBe(false);
  });
});
