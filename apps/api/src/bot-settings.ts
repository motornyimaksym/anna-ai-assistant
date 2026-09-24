import type { BotSettings } from '@booking/contracts';

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  maxReadDelayMs: 2_000,
  typingDelayPerSymbolMs: 600,
};
