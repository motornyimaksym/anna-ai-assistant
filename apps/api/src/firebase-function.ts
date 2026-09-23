import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { createApp } from './main.js';
import { stripApiPrefix } from './routing.js';

const secrets = [
  defineSecret('TELEGRAM_BOT_TOKEN'),
  defineSecret('TELEGRAM_WEBHOOK_SECRET'),
  defineSecret('OPENAI_API_KEY'),
  defineSecret('GOOGLE_CLIENT_SECRET'),
  defineSecret('GOOGLE_REFRESH_TOKEN'),
  defineSecret('ADMIN_UIDS'),
];
let applicationPromise: ReturnType<typeof createApp> | undefined;
export const api = onRequest({ region: 'europe-west1', secrets }, async (request, response) => {
  applicationPromise ??= createApp().then(async (app) => { await app.init(); return app; });
  const application = await applicationPromise;
  request.url = stripApiPrefix(request.url);
  application.getHttpAdapter().getInstance()(request, response);
});
