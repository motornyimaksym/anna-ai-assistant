import { readFile } from 'node:fs/promises';

const file = new URL('../apps/admin/.env.production.local', import.meta.url);
let source = '';
try { source = await readFile(file, 'utf8'); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const values = Object.fromEntries(source.split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];
const missing = required.filter((name) => !process.env[name] && !values[name]);
if (missing.length) throw new Error(`Missing public admin build variables: ${missing.join(', ')}`);
