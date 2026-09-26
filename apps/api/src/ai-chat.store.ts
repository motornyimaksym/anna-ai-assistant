import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { aiChatThreadSchema, aiChatSummarySchema, type AiChatAction, type AiChatThread } from '@booking/contracts';
import { FirebaseAdminService } from './firebase-admin.js';
export type StoredThread = Omit<AiChatThread, 'action'> & { action?: AiChatAction & { sessionFingerprint: string }; leaseId?: string; leaseUntil?: number };
@Injectable()
export class AiChatStore {
  constructor(_firebase: FirebaseAdminService) {}
  private collection(uid: string) { return getFirestore().collection('aiChatUsers').doc(uid).collection('threads'); }
  async list(uid: string) {
    const result = await this.collection(uid).orderBy('updatedAt', 'desc').limit(50).get();
    return result.docs.map((doc) => aiChatSummarySchema.parse(doc.data()));
  }
  async create(uid: string) {
    const now = new Date().toISOString();
    const thread: StoredThread = { id: randomUUID(), title: 'New chat', createdAt: now, updatedAt: now, messages: [] };
    await this.collection(uid).doc(thread.id).create(thread);
    return this.view(thread);
  }
  view(thread: StoredThread): AiChatThread {
    const result = aiChatThreadSchema.parse(thread);
    if (result.action?.status === 'sending' && (thread.leaseUntil ?? 0) <= Date.now()) result.action.status = 'uncertain';
    return result;
  }
  async read(uid: string, id: string) {
    const data = (await this.collection(uid).doc(id).get()).data();
    if (!data) throw new NotFoundException('Chat not found');
    return this.view(data as StoredThread);
  }
  async acquire(uid: string, id: string) {
    const ref = this.collection(uid).doc(id);
    return getFirestore().runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data() as StoredThread | undefined;
      if (!data) throw new NotFoundException('Chat not found');
      if ((data.leaseUntil ?? 0) > Date.now()) throw new ConflictException('This chat is processing a request. Try again shortly.');
      if (data.action?.status === 'sending') data.action.status = 'uncertain';
      data.leaseId = randomUUID(); data.leaseUntil = Date.now() + 120_000;
      tx.set(ref, data);
      return data;
    });
  }
  async save(uid: string, thread: StoredThread, release = true) {
    const ref = this.collection(uid).doc(thread.id);
    await getFirestore().runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data() as StoredThread | undefined;
      if (!current || current.leaseId !== thread.leaseId || (current.leaseUntil ?? 0) <= Date.now()) throw new ConflictException('Chat request expired. Refresh the chat.');
      const data = { ...thread, messages: thread.messages.slice(-40), updatedAt: new Date().toISOString() };
      if (release) { delete data.leaseId; delete data.leaseUntil; }
      tx.set(ref, data);
    });
  }
}
