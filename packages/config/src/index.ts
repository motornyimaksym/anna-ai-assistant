import { z } from 'zod';
const optionalSecret = z.string().min(1).optional();
const publicSiteUrl = z.string().url().transform((value, ctx) => {
  const url = new URL(value);
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((!localHttp && url.protocol !== 'https:') || url.username || url.password || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PUBLIC_SITE_URL must be an HTTPS origin without path, query, or fragment' });
    return z.NEVER;
  }
  return url.origin;
}).default('https://anna-ai-assistant.web.app');
export const backendEnvSchema = z.object({ NODE_ENV: z.enum(['development', 'test', 'production']).default('development'), PORT: z.coerce.number().int().positive().default(2301), DEFAULT_TIMEZONE: z.string().default('Europe/Kyiv'), TELEGRAM_API_ID: z.coerce.number().int().positive().optional(), TELEGRAM_API_HASH: z.string().regex(/^[a-fA-F0-9]{32}$/).optional(), TELEGRAM_SESSION_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9+/]{43}=$/).optional(), TELEGRAM_BOT_TOKEN: optionalSecret, TELEGRAM_WEBHOOK_SECRET: optionalSecret, TELEGRAM_ALLOWED_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/).optional(), OPENAI_API_KEY: optionalSecret, OPENAI_ADMIN_KEY: optionalSecret, OPENAI_TOTAL_CREDITS: z.preprocess((value) => value === undefined || value === '' ? undefined : Number(value), z.number().finite().nonnegative().optional()), OPENAI_CREDITS_START_TIME: z.preprocess((value) => value === undefined || value === '' ? undefined : Number(value), z.number().int().positive().optional()), TYPESAFE_AI_TOKEN: z.string().trim().min(1).optional(), OPENAI_MODEL: z.string().default('gpt-4o-mini'), GOOGLE_CLIENT_ID: optionalSecret, GOOGLE_CALENDAR_REDIRECT_URI: z.string().url().optional(), GOOGLE_CALENDAR_ACCOUNT_EMAIL: z.string().email().optional(), GOOGLE_CALENDAR_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9+/]{43}=$/).optional(), GOOGLE_CLIENT_SECRET: optionalSecret, GOOGLE_REFRESH_TOKEN: optionalSecret, GOOGLE_CALENDAR_ID: optionalSecret, MONOBANK_ACQUIRING_TOKEN: optionalSecret, PUBLIC_SITE_URL: publicSiteUrl, FIREBASE_PROJECT_ID: optionalSecret, DEBUG_OWNER_UID: z.string().min(1).optional(), ADMIN_UIDS: z.string().default('') });
export type BackendEnv = z.infer<typeof backendEnvSchema>;
export const loadBackendEnv = (source: Record<string, string | undefined>): BackendEnv => backendEnvSchema.parse(source);
export const backendRuntimeEnvSchema = backendEnvSchema.omit({ PORT: true });
export type BackendRuntimeEnv = z.infer<typeof backendRuntimeEnvSchema>;
export const loadBackendRuntimeEnv = (source: Record<string, string | undefined>): BackendRuntimeEnv => backendRuntimeEnvSchema.parse(source);
export const frontendEnvSchema = z.object({ VITE_FIREBASE_API_KEY: z.string().optional(), VITE_FIREBASE_AUTH_DOMAIN: z.string().optional(), VITE_FIREBASE_PROJECT_ID: z.string().optional(), VITE_FIREBASE_APP_ID: z.string().optional() });
export type FrontendEnv = z.infer<typeof frontendEnvSchema>;
