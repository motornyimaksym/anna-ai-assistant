import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getFirestore } from 'firebase-admin/firestore';
import { createMessageStoreSchema, messageStoreIdSchema, messageStoreSchema, updateMessageStoreSchema, type MessageStoreDto } from '@booking/contracts';
import { FirebaseAdminService } from './firebase-admin.js';
import { MESSAGE_STORE_STARTERS } from './message-store-starters.js';

@Injectable()
export class MessageStoreService {
  private readonly db = getFirestore();

  constructor(_firebase: FirebaseAdminService) {}

  private ref(id: string) {
    return this.db.collection('messageStore').doc(messageStoreIdSchema.parse(id));
  }

  async list(): Promise<MessageStoreDto[]> {
    const snapshot = await this.db.collection('messageStore').get();
    return snapshot.docs
      .map((doc) => messageStoreSchema.parse({ ...doc.data(), id: doc.id }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async enabled() {
    return (await this.list()).filter((item) => item.enabled);
  }

  async select(id: string): Promise<{ status: 'selected'; text: string; entities: MessageStoreDto['entities'] } | { status: 'unavailable' }> {
    const snapshot = await this.ref(id).get();
    if (!snapshot.exists) return { status: 'unavailable' };
    const item = messageStoreSchema.parse({ ...snapshot.data(), id: snapshot.id });
    return item.enabled ? { status: 'selected', text: item.text, entities: item.entities } : { status: 'unavailable' };
  }

  async create(body: unknown): Promise<MessageStoreDto> {
    const metadata = createMessageStoreSchema.parse(body);
    const ref = this.db.collection('messageStore').doc();
    const now = new Date().toISOString();
    const item = { ...metadata, entities: metadata.entities ?? [], id: ref.id, createdAt: now, updatedAt: now };
    await ref.create(item);
    return messageStoreSchema.parse(item);
  }

  async update(id: string, body: unknown): Promise<MessageStoreDto> {
    const metadata = updateMessageStoreSchema.parse(body);
    const ref = this.ref(id);
    const item = await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new NotFoundException('Saved message not found');
      const current = snapshot.data()!;
      const next = { ...current, ...metadata, id: snapshot.id, updatedAt: new Date().toISOString() };
      if (metadata.text !== undefined && metadata.text !== current.text && metadata.entities === undefined) next.entities = [];
      tx.set(ref, next);
      return next;
    });
    return messageStoreSchema.parse(item);
  }

  async delete(id: string): Promise<{ ok: true }> {
    const ref = this.ref(id);
    await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new NotFoundException('Saved message not found');
      tx.delete(ref);
    });
    return { ok: true };
  }

  async importStarters(): Promise<{ imported: number; existing: number }> {
    const refs = MESSAGE_STORE_STARTERS.map((starter) => this.ref(starter.id));
    const now = new Date().toISOString();
    return this.db.runTransaction(async (tx) => {
      const snapshots = await tx.getAll(...refs);
      let imported = 0;
      let existing = 0;
      snapshots.forEach((snapshot, index) => {
        if (snapshot.exists) {
          existing += 1;
          return;
        }
        const starter = MESSAGE_STORE_STARTERS[index];
        if (!starter) throw new BadRequestException('Starter message is missing');
        tx.create(refs[index]!, { ...starter, createdAt: now, updatedAt: now });
        imported += 1;
      });
      return { imported, existing };
    });
  }
}
