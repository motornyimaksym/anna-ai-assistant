import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { telegramScheduleSlotsResponseSchema, type TelegramScheduleSlot, type TelegramScheduleSlotsResponse } from '@booking/contracts';
import { FirebaseAdminService } from './firebase-admin.js';

export type TelegramScheduleSnapshot = { sourcePeerId: string; sourceChatTitle: string; sourceTopicId?: number; sourceTopicTitle?: string; slots: TelegramScheduleSlot[]; syncedAt: string };
export type ScheduleSyncStatus = NonNullable<TelegramScheduleSlotsResponse['status']>;
export type ScheduleSyncClaim = { allowed: boolean; sourcePeerId?: string; sourceTopicId?: number; attemptId?: string };
export type ManualScheduleSyncClaim = ScheduleSyncClaim & { runId?: string };
const manualRetryable = new Set<ScheduleSyncStatus>(['account_busy', 'connection_failed', 'timeout']);
const failureStatuses = new Set<ScheduleSyncStatus>(['source_not_found', 'disconnected', 'account_busy', 'connection_failed', 'timeout']);
const syncClaim = (attemptId: string, now: number) => ({
  nextAttemptAt: now + 5 * 60_000,
  lastAttemptAt: new Date(now).toISOString(),
  status: 'syncing',
  attemptId,
});

@Injectable()
export class TelegramScheduleImportStore {
  constructor(_firebase: FirebaseAdminService) {}
  private get ref() { return getFirestore().collection('telegramScheduleImports').doc('availability'); }

  async claimSync(now = Date.now()): Promise<{ allowed: boolean; sourcePeerId?: string; sourceTopicId?: number; attemptId?: string }> {
    return getFirestore().runTransaction(async (transaction) => {
      const data = (await transaction.get(this.ref)).data() ?? {};
      const topic = typeof data.sourceTopicId === 'number' ? { sourceTopicId: data.sourceTopicId } : {};
      const sourcePeerId = typeof data.sourcePeerId === 'string' ? data.sourcePeerId : undefined;
      if (typeof data.nextAttemptAt === 'number' && data.nextAttemptAt > now) return { allowed: false, sourcePeerId, ...topic };
      const attemptId = randomUUID();
      transaction.set(this.ref, { nextAttemptAt: now + 5 * 60_000, lastAttemptAt: new Date(now).toISOString(), status: 'syncing', attemptId }, { merge: true });
      return { allowed: true, sourcePeerId, ...topic, attemptId };
    });
  }

  async claimManualSync(now = Date.now()): Promise<ManualScheduleSyncClaim> {
    return getFirestore().runTransaction(async (transaction) => {
      const data = (await transaction.get(this.ref)).data() ?? {};
      const sourcePeerId = typeof data.sourcePeerId === 'string' ? data.sourcePeerId : undefined;
      const topic = typeof data.sourceTopicId === 'number' ? { sourceTopicId: data.sourceTopicId } : {};
      const runActive = typeof data.manualRetryRunId === 'string' && data.manualRetryRunId.length > 0 && typeof data.manualRetryUntil === 'number' && data.manualRetryUntil > now;
      if (runActive) return { allowed: false, sourcePeerId, ...topic };
      const staleSync = data.status === 'syncing' && typeof data.lastAttemptAt === 'string' && Date.parse(data.lastAttemptAt) + 60_000 <= now;
      const failed = failureStatuses.has(data.status as ScheduleSyncStatus) || staleSync;
      if (data.status === 'syncing' && !staleSync) return { allowed: false, sourcePeerId, ...topic };
      if (!failed && typeof data.nextAttemptAt === 'number' && data.nextAttemptAt > now) return { allowed: false, sourcePeerId, ...topic };
      const runId = randomUUID();
      const attemptId = randomUUID();
      transaction.set(this.ref, { ...syncClaim(attemptId, now), manualRetryRunId: runId, manualRetryUntil: now + 5 * 60_000 }, { merge: true });
      return { allowed: true, sourcePeerId, ...topic, attemptId, runId };
    });
  }

  async claimManualRetry(runId: string, now = Date.now()): Promise<ScheduleSyncClaim> {
    return getFirestore().runTransaction(async (transaction) => {
      const data = (await transaction.get(this.ref)).data() ?? {};
      const sourcePeerId = typeof data.sourcePeerId === 'string' ? data.sourcePeerId : undefined;
      const topic = typeof data.sourceTopicId === 'number' ? { sourceTopicId: data.sourceTopicId } : {};
      if (data.manualRetryRunId !== runId || typeof data.manualRetryUntil !== 'number' || data.manualRetryUntil <= now || !manualRetryable.has(data.status as ScheduleSyncStatus)) return { allowed: false, sourcePeerId, ...topic };
      const attemptId = randomUUID();
      transaction.set(this.ref, syncClaim(attemptId, now), { merge: true });
      return { allowed: true, sourcePeerId, ...topic, attemptId };
    });
  }

  async finishManualRetryRun(runId: string, now = Date.now()): Promise<void> {
    await getFirestore().runTransaction(async (transaction) => {
      const data = (await transaction.get(this.ref)).data() ?? {};
      if (data.manualRetryRunId !== runId) return;
      transaction.set(this.ref, { manualRetryRunId: '', manualRetryUntil: now }, { merge: true });
    });
  }

  async complete(attemptId: string, status: ScheduleSyncStatus, snapshot?: TelegramScheduleSnapshot): Promise<void> {
    await getFirestore().runTransaction(async (transaction) => {
      const data = (await transaction.get(this.ref)).data() ?? {};
      if (data.attemptId !== attemptId) return;
      transaction.set(this.ref, { ...snapshot, status }, { merge: true });
    });
  }

  async selectSource(id: string, title: string, topic?: { id: number; title: string }): Promise<void> {
    await getFirestore().runTransaction(async (transaction) => {
      const data = (await transaction.get(this.ref)).data() ?? {};
      transaction.set(this.ref, {
        sourcePeerId: id, sourceChatTitle: title, slots: [], status: 'idle',
        ...(topic ? { sourceTopicId: topic.id, sourceTopicTitle: topic.title } : {}),
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
      sourceTopicId: data.sourceTopicId, sourceTopicTitle: data.sourceTopicTitle,
      syncedAt: data.syncedAt, lastAttemptAt: data.lastAttemptAt, status,
      ...(typeof data.nextAttemptAt === 'number' ? { nextAttemptAt: new Date(data.nextAttemptAt).toISOString() } : {}),
      slots: Array.isArray(data.slots) ? data.slots : [],
    });
  }
}
