import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { telegramScheduleSlotsResponseSchema, type TelegramScheduleSlot, type TelegramScheduleSlotsResponse } from '@booking/contracts';
import { FirebaseAdminService } from './firebase-admin.js';

export type TelegramScheduleSnapshot = { sourcePeerId: string; sourceChatTitle: string; slots: TelegramScheduleSlot[]; syncedAt: string };
export type ScheduleSyncStatus = NonNullable<TelegramScheduleSlotsResponse['status']>;

@Injectable()
export class TelegramScheduleImportStore {
  constructor(_firebase: FirebaseAdminService) {}
  private get ref() { return getFirestore().collection('telegramScheduleImports').doc('availability'); }

  async claimSync(now = Date.now()): Promise<{ allowed: boolean; sourcePeerId?: string; attemptId?: string }> {
    return getFirestore().runTransaction(async (transaction) => {
      const data = (await transaction.get(this.ref)).data() ?? {};
      const sourcePeerId = typeof data.sourcePeerId === 'string' ? data.sourcePeerId : undefined;
      if (typeof data.nextAttemptAt === 'number' && data.nextAttemptAt > now) return { allowed: false, sourcePeerId };
      const attemptId = randomUUID();
      transaction.set(this.ref, { nextAttemptAt: now + 5 * 60_000, lastAttemptAt: new Date(now).toISOString(), status: 'syncing', attemptId }, { merge: true });
      return { allowed: true, sourcePeerId, attemptId };
    });
  }

  async complete(attemptId: string, status: ScheduleSyncStatus, snapshot?: TelegramScheduleSnapshot): Promise<void> {
    await getFirestore().runTransaction(async (transaction) => {
      const data = (await transaction.get(this.ref)).data() ?? {};
      if (data.attemptId !== attemptId) return;
      transaction.set(this.ref, { ...snapshot, status }, { merge: true });
    });
  }

  async selectSource(id: string, title: string): Promise<void> {
    await getFirestore().runTransaction(async (transaction) => {
      const data = (await transaction.get(this.ref)).data() ?? {};
      transaction.set(this.ref, {
        sourcePeerId: id, sourceChatTitle: title, slots: [], status: 'idle',
        ...(typeof data.nextAttemptAt === 'number' ? { nextAttemptAt: data.nextAttemptAt } : {}),
        ...(typeof data.lastAttemptAt === 'string' ? { lastAttemptAt: data.lastAttemptAt } : {}),
      });
    });
  }

  async readSnapshot(): Promise<TelegramScheduleSlotsResponse> {
    const data = (await this.ref.get()).data() ?? {};
    let status = data.status ?? (data.syncedAt ? 'success' : 'idle');
    if (status === 'syncing' && typeof data.lastAttemptAt === 'string' && Date.parse(data.lastAttemptAt) + 60_000 < Date.now()) status = 'timeout';
    return telegramScheduleSlotsResponseSchema.parse({
      sourcePeerId: data.sourcePeerId, sourceChatTitle: data.sourceChatTitle,
      syncedAt: data.syncedAt, lastAttemptAt: data.lastAttemptAt, status,
      ...(typeof data.nextAttemptAt === 'number' ? { nextAttemptAt: new Date(data.nextAttemptAt).toISOString() } : {}),
      slots: Array.isArray(data.slots) ? data.slots : [],
    });
  }
}
