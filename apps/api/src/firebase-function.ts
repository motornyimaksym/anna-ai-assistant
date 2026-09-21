import { onRequest } from 'firebase-functions/v2/https';
import { createApp } from './main.js';
let application: Awaited<ReturnType<typeof createApp>> | undefined;
export const api = onRequest({ region: 'europe-west1' }, async (request, response) => { application ??= await createApp(); application.getHttpAdapter().getInstance()(request, response); });
