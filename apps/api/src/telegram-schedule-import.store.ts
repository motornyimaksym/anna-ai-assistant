import { Injectable } from '@nestjs/common';
import { getFirestore } from 'firebase-admin/firestore';
import { telegramScheduleSlotsResponseSchema, type TelegramScheduleSlot, type TelegramScheduleSlotsResponse } from '@booking/contracts';
import { FirebaseAdminService } from './firebase-admin.js';

export type TelegramScheduleSnapshot = { sourcePeerId: string; sourceChatTitle: string; slots: TelegramScheduleSlot[]; syncedAt: string };

@Injectable()
export class TelegramScheduleImportStore {
  constructor(_firebase: FirebaseAdminService) {}
  private get ref() { return getFirestore().collection('telegramScheduleImports').doc('availability'); }

  async claimSync(now = Date.now()): Promise<{ allowed: boolean; sourcePeerId?: string }> {
    return getFirestore().runTransaction(async (transaction) => {
      const data = (await transaction.get(this.ref)).data() ?? {};
      const sourcePeerId = typeof data.sourcePeerId === 'string' ? data.sourcePeerId : undefined;
      if (typeof data.nextAttemptAt === 'number' && data.nextAttemptAt > now) return { allowed: false, sourcePeerId };
      transaction.set(this.ref, { nextAttemptAt: now + 5 * 60_000 }, { merge: true });
      return { allowed: true, sourcePeerId };
    });
  }

  async saveSnapshot(snapshot: TelegramScheduleSnapshot): Promise<void> {
    await this.ref.set(snapshot, { merge: true });
  }

  async readSnapshot(): Promise<TelegramScheduleSlotsResponse> {
    const data = (await this.ref.get()).data() ?? {};
    return telegramScheduleSlotsResponseSchema.parse({
      ...(typeof data.sourceChatTitle === 'string' ? { sourceChatTitle: data.sourceChatTitle } : {}),
      ...(typeof data.syncedAt === 'string' ? { syncedAt: data.syncedAt } : {}),
      slots: Array.isArray(data.slots) ? data.slots : [],
    });
  }
}
