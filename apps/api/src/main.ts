import 'reflect-metadata'; import { NestFactory } from '@nestjs/core'; import type { NestExpressApplication } from '@nestjs/platform-express'; import { AppModule } from './app.module.js';
import { loadBackendEnv } from '@booking/config';
import { fileURLToPath } from 'node:url';
if (process.env.NODE_ENV !== 'production') {
  try { process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
export const createApp = async () => { const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'], bodyParser: false }); app.useBodyParser('json', { limit: '28mb' }); app.enableCors({ origin: true }); return app; };
if (import.meta.url === `file://${process.argv[1]}`) { void createApp().then((app) => app.listen(loadBackendEnv(process.env).PORT)); }
