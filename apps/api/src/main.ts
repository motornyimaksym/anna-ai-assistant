import 'reflect-metadata'; import { NestFactory } from '@nestjs/core'; import { AppModule } from './app.module.js';
import { loadBackendEnv } from '@booking/config';
export const createApp = async () => { const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] }); app.enableCors({ origin: true }); return app; };
if (import.meta.url === `file://${process.argv[1]}`) { void createApp().then((app) => app.listen(loadBackendEnv(process.env).PORT)); }
