import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { getFirebaseRuntimeConfig } from './firebase-runtime-config.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const destination = join(root, 'firebase', 'functions');
const publicDirectory = join(root, 'firebase', 'public');
const api = join(root, 'apps', 'api');

const readManifest = async (path) => JSON.parse(await readFile(path, 'utf8'));
const productionManifest = (manifest, isFunction = false) => ({
  name: manifest.name,
  version: manifest.version,
  private: true,
  type: manifest.type,
  ...(isFunction ? { main: manifest.main, engines: { node: '22' } } : { main: manifest.main, types: manifest.types }),
  dependencies: Object.fromEntries(Object.entries(manifest.dependencies ?? {}).map(([name, version]) => [
    name,
    version === 'workspace:*' ? `file:${isFunction ? './packages' : '..'}/${name.split('/').at(-1)}` : version,
  ])),
});

await rm(publicDirectory, { recursive: true, force: true });
await cp(join(root, 'apps', 'admin', 'dist'), publicDirectory, { recursive: true });
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const apiManifest = await readManifest(join(api, 'package.json'));
const workspacePackages = Object.entries(apiManifest.dependencies ?? {})
  .filter(([, version]) => version === 'workspace:*')
  .map(([name]) => name.split('/').at(-1));
await cp(join(api, 'dist'), join(destination, 'dist'), { recursive: true });
await cp(join(root, 'SPEC.md'), join(destination, 'SPEC.md'));
await writeFile(join(destination, 'package.json'), `${JSON.stringify(productionManifest(apiManifest, true), null, 2)}\n`);

for (const name of workspacePackages) {
  const source = join(root, 'packages', name);
  const target = join(destination, 'packages', name);
  const manifest = await readManifest(join(source, 'package.json'));
  await mkdir(target, { recursive: true });
  await cp(join(source, 'dist'), join(target, 'dist'), { recursive: true });
  await writeFile(join(target, 'package.json'), `${JSON.stringify(productionManifest(manifest), null, 2)}\n`);
}

let rootEnvSource = '';
try { rootEnvSource = await readFile(join(root, '.env'), 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const runtimeConfig = getFirebaseRuntimeConfig(process.env, rootEnvSource);
const runtimeLines = Object.entries(runtimeConfig).map(([name, value]) => `${name}=${JSON.stringify(value)}`);
if (runtimeLines.length) await writeFile(join(destination, '.env'), `${runtimeLines.join('\n')}\n`);

execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
  cwd: destination,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});
