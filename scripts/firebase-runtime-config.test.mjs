import assert from 'node:assert/strict';
import test from 'node:test';
import { getFirebaseRuntimeConfig } from './firebase-runtime-config.mjs';

test('loads only allowlisted Calendar values from root env when shell values are absent', () => {
  const config = getFirebaseRuntimeConfig({}, [
    'GOOGLE_CLIENT_ID=client-id.apps.googleusercontent.com',
    'GOOGLE_CALENDAR_REDIRECT_URI=https://anna-ai-assistant.web.app/google-calendar/callback',
    'GOOGLE_CALENDAR_ACCOUNT_EMAIL=anna.lush.massage@gmail.com',
    'GOOGLE_CLIENT_SECRET=secret-value',
    'GOOGLE_REFRESH_TOKEN=refresh-value',
    'OPENAI_MODEL=model-from-file',
  ].join('\n'));

  assert.deepEqual(config, {
    GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    GOOGLE_CALENDAR_REDIRECT_URI: 'https://anna-ai-assistant.web.app/google-calendar/callback',
    GOOGLE_CALENDAR_ACCOUNT_EMAIL: 'anna.lush.massage@gmail.com',
  });
  assert.ok(!JSON.stringify(config).includes('secret-value'));
  assert.ok(!JSON.stringify(config).includes('refresh-value'));
  assert.ok(!('OPENAI_MODEL' in config));
});

test('shell values override root env and other runtime values remain shell-only', () => {
  const config = getFirebaseRuntimeConfig({ GOOGLE_CLIENT_ID: 'shell-client', OPENAI_MODEL: 'shell-model' }, [
    'GOOGLE_CLIENT_ID=file-client',
    'GOOGLE_CALENDAR_REDIRECT_URI=https://anna-ai-assistant.web.app/google-calendar/callback',
    'OPENAI_MODEL=file-model',
  ].join('\n'));

  assert.deepEqual(config, {
    OPENAI_MODEL: 'shell-model',
    GOOGLE_CLIENT_ID: 'shell-client',
    GOOGLE_CALENDAR_REDIRECT_URI: 'https://anna-ai-assistant.web.app/google-calendar/callback',
  });
});

test('an explicitly empty shell value suppresses the root env fallback', () => {
  assert.deepEqual(
    getFirebaseRuntimeConfig({ GOOGLE_CLIENT_ID: '' }, 'GOOGLE_CLIENT_ID=file-client'),
    {},
  );
});
