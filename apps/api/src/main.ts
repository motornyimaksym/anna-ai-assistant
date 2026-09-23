import 'reflect-metadata'; import { NestFactory } from '@nestjs/core'; import { AppModule } from './app.module.js';
export const createApp = async () => { const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] }); app.enableCors({ origin: true }); return app; };
if (import.meta.url === `file://${process.argv[1]}`) { const app = await createApp(); await app.listen(Number(process.env.PORT ?? 2301)); }
