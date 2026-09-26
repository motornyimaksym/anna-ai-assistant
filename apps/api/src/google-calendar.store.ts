import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { FirebaseAdminService } from './firebase-admin.js';
export type CalendarEnvelope = { version: 1; iv: string; tag: string; ciphertext: string };
export type CalendarConnection = {
  revision: string; phase: 'disconnected' | 'pending' | 'connected';
  email?: string; calendarId?: string; calendarTitle?: string; checkedAt?: string; encryptedToken?: CalendarEnvelope;
  expiresAt?: number; pending?: { ownerUid: string; stateHash: string; encryptedProof: CalendarEnvelope };
};
export const stateHash = (value: string) => createHash('sha256').update(value).digest('hex');
function key() {
  const value = Buffer.from(process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY ?? '', 'base64');
  if (value.length !== 32) throw new Error('Calendar encryption is unavailable');
  return value;
}
export function sealCalendar(value: string, purpose: 'token' | 'proof'): CalendarEnvelope {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(`googleCalendarAccount/primary:${purpose}:v1`));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}
export function openCalendar(value: CalendarEnvelope, purpose: 'token' | 'proof'): string {
  if (value.version !== 1) throw new Error('Invalid envelope');
  const cipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(value.iv, 'base64'));
  cipher.setAAD(Buffer.from(`googleCalendarAccount/primary:${purpose}:v1`)); cipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([cipher.update(Buffer.from(value.ciphertext, 'base64')), cipher.final()]).toString('utf8');
}
@Injectable()
export class GoogleCalendarStore {
  constructor(_firebase: FirebaseAdminService) {}
  private get ref() { return getFirestore().collection('googleCalendarAccount').doc('primary'); }
  async read(): Promise<CalendarConnection | undefined> { return (await this.ref.get()).data() as CalendarConnection | undefined; }
  async begin(ownerUid: string, state: string, proof: CalendarEnvelope) {
    await getFirestore().runTransaction(async (tx) => {
      const record = (await tx.get(this.ref)).data() as CalendarConnection | undefined;
      if (record?.phase === 'connected') throw new ConflictException('Disconnect Google Calendar before connecting another account.');
      tx.set(this.ref, { revision: randomUUID(), phase: 'pending', expiresAt: Date.now() + 600000, pending: { ownerUid, stateHash: stateHash(state), encryptedProof: proof } });
    });
  }
  async consume(ownerUid: string, state: string) {
    return getFirestore().runTransaction(async (tx) => {
      const record = (await tx.get(this.ref)).data() as CalendarConnection | undefined;
      if (!record?.pending || record.phase !== 'pending' || record.pending.ownerUid !== ownerUid || record.pending.stateHash !== stateHash(state) || (record.expiresAt ?? 0) <= Date.now()) throw new BadRequestException('Google authorization expired or does not belong to this owner. Start again.');
      const { pending, ...rest } = record;
      tx.set(this.ref, rest);
      return { revision: record.revision, proof: pending.encryptedProof };
    });
  }
  async replace(revision: string | undefined, next: Omit<CalendarConnection, 'revision'>) {
    await getFirestore().runTransaction(async (tx) => {
      const current = (await tx.get(this.ref)).data() as CalendarConnection | undefined;
      if (current?.revision !== revision) throw new ConflictException('Calendar connection changed. Refresh Settings.');
      tx.set(this.ref, { ...next, revision: randomUUID() });
    });
  }
}
