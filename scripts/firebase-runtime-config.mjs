import { parseEnv } from 'node:util';

const publicRuntimeVariables = [
  'TELEGRAM_MCP_BRIDGE_URL', 'DEFAULT_TIMEZONE', 'OPENAI_MODEL', 'OPENAI_TOTAL_CREDITS',
  'OPENAI_CREDITS_START_TIME', 'DEBUG_OWNER_UID', 'TELEGRAM_ALLOWED_USERNAME',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CALENDAR_REDIRECT_URI', 'GOOGLE_CALENDAR_ACCOUNT_EMAIL',
  'GOOGLE_CALENDAR_ID',
];
const calendarEnvFallbacks = new Set([
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CALENDAR_REDIRECT_URI',
  'GOOGLE_CALENDAR_ACCOUNT_EMAIL',
]);

export function getFirebaseRuntimeConfig(environment, rootEnvSource) {
  const rootEnv = parseEnv(rootEnvSource);
  return Object.fromEntries(publicRuntimeVariables.flatMap((name) => {
    const value = Object.hasOwn(environment, name)
      ? environment[name]
      : calendarEnvFallbacks.has(name) ? rootEnv[name] : undefined;
    return value ? [[name, value]] : [];
  }));
}
