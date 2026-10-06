import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDefaultBotSettings, getLegacyTesterUsernames } from '../src/bot-settings.js';

afterEach(() => vi.unstubAllEnvs());

describe('bot tester settings defaults', () => {
  it('uses TELEGRAM_ALLOWED_USERNAME only as the legacy default', () => {
    vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'User61785');
    expect(getLegacyTesterUsernames()).toEqual(['user61785']);
    expect(getDefaultBotSettings()).toEqual({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: ['user61785'], allUsersEnabled: false });
  });

  it('defaults to an empty tester list when no legacy username exists', () => {
    vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', undefined);
    expect(getLegacyTesterUsernames()).toEqual([]);
  });
});
