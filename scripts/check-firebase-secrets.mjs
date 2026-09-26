import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export function validateEncryptionKeys(environment, source) {
  const values = { ...parseEnv(source), ...environment };
  for (const name of ['GOOGLE_CALENDAR_ENCRYPTION_KEY', 'TELEGRAM_SESSION_ENCRYPTION_KEY']) {
    const value = values[name];
    if (value === undefined) continue;
    const bytes = Buffer.from(value, 'base64');
    if (bytes.length !== 32 || bytes.toString('base64') !== value) {
      throw new Error(`${name} must be 32 random bytes encoded as base64. Generate with openssl rand -base64 32; preserve existing valid keys. Root .env is local only; provision the matching Secret Manager value separately.`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let source = '';
  try { source = await readFile(new URL('../.env', import.meta.url), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  validateEncryptionKeys(process.env, source);
}
