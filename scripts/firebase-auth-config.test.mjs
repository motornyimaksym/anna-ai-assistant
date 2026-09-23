import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = JSON.parse(readFileSync(new URL('../firebase/firebase.json', import.meta.url), 'utf8'));

test('admin sign-in enables only Google and authorizes the deployed site', () => {
  assert.deepEqual(Object.keys(config.auth.providers), ['googleSignIn']);
  assert.ok(config.auth.providers.googleSignIn.supportEmail);
  assert.ok(config.auth.authorizedDomains.includes('anna-ai-assistant.web.app'));
  assert.ok(config.auth.authorizedDomains.includes('anna-ai-assistant.firebaseapp.com'));
});
