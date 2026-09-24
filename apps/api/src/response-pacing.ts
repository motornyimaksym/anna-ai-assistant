import { DEFAULT_BOT_SETTINGS } from './bot-settings.js';

export const responseDelayMs = (text: string, delayPerSymbolMs = DEFAULT_BOT_SETTINGS.typingDelayPerSymbolMs): number => Array.from(text).length * delayPerSymbolMs;

export const waitForResponsePacing = async (text: string, delayPerSymbolMs = DEFAULT_BOT_SETTINGS.typingDelayPerSymbolMs): Promise<void> => {
  const delay = responseDelayMs(text, delayPerSymbolMs);
  if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
};

export const randomReadDelayMs = (maxDelayMs: number, random = Math.random): number => Math.floor(random() * (maxDelayMs + 1));

export const waitForRandomReadDelay = async (maxDelayMs: number): Promise<number> => {
  const delay = randomReadDelayMs(maxDelayMs);
  if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
  return delay;
};
