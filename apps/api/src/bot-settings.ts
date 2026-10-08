import type { BotSettings } from '@booking/contracts';
import { botSettingsSchema } from '@booking/contracts';
import { loadBackendRuntimeEnv } from '@booking/config';

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  maxReadDelayMs: 2_000,
  typingDelayPerSymbolMs: 600,
  testerUsernames: [],
  allUsersEnabled: false,
  responseVersion: 'v1',
};

export const getLegacyTesterUsernames = (): string[] => {
  const username = loadBackendRuntimeEnv(process.env).TELEGRAM_ALLOWED_USERNAME;
  if (!username) return [];
  const parsed = botSettingsSchema.shape.testerUsernames.safeParse([username]);
  return parsed.success ? parsed.data : [];
};

export const getDefaultBotSettings = (): BotSettings => ({ ...DEFAULT_BOT_SETTINGS, testerUsernames: getLegacyTesterUsernames() });
