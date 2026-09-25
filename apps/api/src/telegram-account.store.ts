import { ConflictException, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import type { TelegramAccountStatus } from '@booking/contracts';
import { FirebaseAdminService } from './firebase-admin.js';

export type Envelope = { version: 1; iv: string; tag: string; ciphertext: string };
export type SessionPayload = { session: string; phone?: string; phoneCodeHash?: string };
export type AccountRecord = {
  phase: TelegramAccountStatus['phase'];
  encrypted?: Envelope;
  ownerUid?: string;
  expiresAt?: number;
  attempts?: number;
  retryAt?: number;
  startRetryAt?: number;
  maskedPhone?: string;
  username?: string;
  leaseId?: string;
  leaseUntil?: number;
};
const aad = Buffer.from('telegramAccount/primary:v1');
export function encryptSession(value: SessionPayload, key: Buffer): Envelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}
export function decryptSession(value: Envelope, key: Buffer): SessionPayload {
  if (value.version !== 1) throw new Error('Unsupported session version');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8')) as SessionPayload;
}

@Injectable()
export class TelegramAccountStore {
  constructor(_firebase: FirebaseAdminService) {}
  private get ref() { return getFirestore().collection('telegramAccount').doc('primary'); }
  async read(): Promise<AccountRecord> { return (await this.ref.get()).data() as AccountRecord | undefined ?? { phase: 'disconnected' }; }
  async acquire(): Promise<{ id: string; record: AccountRecord }> {
    const id = randomUUID();
    return getFirestore().runTransaction(async (tx) => {
      const record = (await tx.get(this.ref)).data() as AccountRecord | undefined ?? { phase: 'disconnected' };
      if ((record.leaseUntil ?? 0) > Date.now()) throw new ConflictException('Another Telegram request is running. Try again shortly.');
      tx.set(this.ref, { ...record, leaseId: id, leaseUntil: Date.now() + 50_000 });
      return { id, record };
    });
  }
  async finish(id: string, record: AccountRecord): Promise<void> {
    await getFirestore().runTransaction(async (tx) => {
      const current = (await tx.get(this.ref)).data() as AccountRecord | undefined;
      if (current?.leaseId !== id || (current.leaseUntil ?? 0) <= Date.now()) throw new ConflictException('Telegram request expired. Refresh and try again.');
      const data = { ...record };
      delete data.leaseId;
      delete data.leaseUntil;
      tx.set(this.ref, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
    });
  }
}
