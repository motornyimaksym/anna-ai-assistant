import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { BookingRepository } from './repository.js';
export const seed = (repository: BookingRepository): void => { for (const service of [{ id: 'massage-60', name: 'Масаж 60 хв', description: 'Класичний масаж', durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH', enabled: true }, { id: 'massage-90', name: 'Масаж 90 хв', description: 'Класичний масаж', durationMinutes: 90, bufferMinutes: 15, price: 2000, currency: 'UAH', enabled: true }]) repository.saveService(service); repository.setRules([1, 2, 3, 4, 5].map((dayOfWeek) => ({ id: `weekday-${dayOfWeek}`, dayOfWeek, start: '10:00', end: '20:00', enabled: true })).concat({ id: 'saturday', dayOfWeek: 6, start: '11:00', end: '17:00', enabled: true })); };
if (import.meta.url === `file://${process.argv[1]}`) { const app = await NestFactory.createApplicationContext(AppModule); seed(app.get(BookingRepository)); await app.close(); }
