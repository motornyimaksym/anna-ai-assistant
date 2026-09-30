import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { BookingRepository } from './repository.js';
import { CalendarService } from './calendar.js';
import type { FirebaseAdminService } from './firebase-admin.js';
import { GoogleCalendarStore } from './google-calendar.store.js';
import { GoogleCalendarConnection } from './google-calendar.connection.js';

try { process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url))); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const apply = process.argv.includes('--apply');
initializeApp({ credential: applicationDefault(), ...(process.env.FIREBASE_PROJECT_ID ? { projectId: process.env.FIREBASE_PROJECT_ID } : {}) });
const firebase = undefined as unknown as FirebaseAdminService;
const repository = new BookingRepository(firebase);
const calendar = new CalendarService(new GoogleCalendarConnection(new GoogleCalendarStore(firebase)));
const legacy = (await repository.listBookings()).filter((booking) => booking.status !== 'cancelled');
let ready = 0; let pending = 0; let missing = 0;
for (const booking of legacy) {
  const current = await calendar.getBookingEvent(booking);
  if (!current) { missing++; continue; }
  const timing = await repository.getBookingTiming(booking.id);
  const result = await calendar.backfillLegacyBookingEvent(booking, timing.bufferMinutes, apply);
  if (result === 'ready') ready++; else pending++;
}
process.stdout.write(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', checked: legacy.length, ready, pending, missingTreatedAsCancelled: missing }) + '\n');
if (pending) process.exitCode = 2;
