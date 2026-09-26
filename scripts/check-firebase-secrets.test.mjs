import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { validateEncryptionKeys } from './check-firebase-secrets.mjs';

test('allows Secret Manager-only configuration and valid local encryption keys', () => {
  assert.doesNotThrow(() => validateEncryptionKeys({}, ''));
  const key = randomBytes(32).toString('base64');
  assert.doesNotThrow(() => validateEncryptionKeys({}, `GOOGLE_CALENDAR_ENCRYPTION_KEY="${key}"`));
  assert.doesNotThrow(() => validateEncryptionKeys({ TELEGRAM_SESSION_ENCRYPTION_KEY: key }, ''));
});

test('rejects invalid encryption keys without exposing values', () => {
  for (const name of ['GOOGLE_CALENDAR_ENCRYPTION_KEY', 'TELEGRAM_SESSION_ENCRYPTION_KEY']) {
    for (const value of ['invalid-password', '', randomBytes(31).toString('base64'), `${'A'.repeat(42)}B=`]) {
      assert.throws(() => validateEncryptionKeys({ [name]: value }, ''), (error) => {
        assert.match(error.message, new RegExp(name));
        assert.match(error.message, /openssl rand -base64 32/);
        if (value) assert.ok(!error.message.includes(value));
        return true;
      });
    }
  }
});

test('checks root env but gives explicit shell values precedence', () => {
  const key = randomBytes(32).toString('base64');
  assert.throws(() => validateEncryptionKeys({}, 'GOOGLE_CALENDAR_ENCRYPTION_KEY=invalid'));
  assert.doesNotThrow(() => validateEncryptionKeys({ GOOGLE_CALENDAR_ENCRYPTION_KEY: key }, 'GOOGLE_CALENDAR_ENCRYPTION_KEY=invalid'));
  assert.throws(() => validateEncryptionKeys({ GOOGLE_CALENDAR_ENCRYPTION_KEY: '' }, `GOOGLE_CALENDAR_ENCRYPTION_KEY=${key}`));
});
