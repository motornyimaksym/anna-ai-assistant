import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const configPath = resolve(root, 'firebase/firebase.json');

test('Hosting public directory stays inside the Firebase CLI project directory', () => {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const projectDirectory = dirname(configPath);
  const publicDirectory = resolve(projectDirectory, config.hosting.public);
  const relativePublicDirectory = relative(projectDirectory, publicDirectory);

  assert.ok(relativePublicDirectory && relativePublicDirectory !== '..');
  assert.ok(!relativePublicDirectory.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
  assert.ok(!isAbsolute(relativePublicDirectory));
});
