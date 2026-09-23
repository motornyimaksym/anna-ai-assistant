import { z } from 'zod';
const optionalSecret = z.string().min(1).optional();
export const backendEnvSchema = z.object({ NODE_ENV: z.enum(['development', 'test', 'production']).default('development'), PORT: z.coerce.number().int().positive().default(2301), DEFAULT_TIMEZONE: z.string().default('Europe/Kyiv'), TELEGRAM_BOT_TOKEN: optionalSecret, TELEGRAM_WEBHOOK_SECRET: optionalSecret, OPENAI_API_KEY: optionalSecret, OPENAI_MODEL: z.string().default('gpt-4o-mini'), GOOGLE_CLIENT_ID: optionalSecret, GOOGLE_CLIENT_SECRET: optionalSecret, GOOGLE_REFRESH_TOKEN: optionalSecret, GOOGLE_CALENDAR_ID: optionalSecret, FIREBASE_PROJECT_ID: optionalSecret, ADMIN_UIDS: z.string().default('') }).superRefine((value, ctx) => { if (value.NODE_ENV === 'production' && !value.FIREBASE_PROJECT_ID) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'FIREBASE_PROJECT_ID is required in production' }); });
export type BackendEnv = z.infer<typeof backendEnvSchema>;
export const loadBackendEnv = (source: Record<string, string | undefined>): BackendEnv => backendEnvSchema.parse(source);
export const frontendEnvSchema = z.object({ VITE_FIREBASE_API_KEY: z.string().optional(), VITE_FIREBASE_AUTH_DOMAIN: z.string().optional(), VITE_FIREBASE_PROJECT_ID: z.string().optional(), VITE_FIREBASE_APP_ID: z.string().optional() });
export type FrontendEnv = z.infer<typeof frontendEnvSchema>;
