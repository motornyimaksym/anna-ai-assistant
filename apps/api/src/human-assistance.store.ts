import { Injectable } from '@nestjs/common';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { humanRequestSchema, updateHumanAssistanceSettingsSchema, type HumanAssistanceSettings, type HumanRequestDto } from '@booking/contracts';
import { FirebaseAdminService } from './firebase-admin.js';
import { randomUUID } from 'node:crypto';

export type Responder = { userId: string; chatId: string; username: string; enrolledAt: string };
const defaults: HumanAssistanceSettings = { thresholdPercent: 60, usernames: [] };
const now = () => new Date().toISOString();
const active = (status: HumanRequestDto['status']) => status === 'open' || status === 'sending' || status === 'uncertain';

@Injectable()
export class HumanAssistanceStore {
  private readonly db: Firestore;
  constructor(_firebase: FirebaseAdminService) { this.db = getFirestore(); }
  async settings(): Promise<HumanAssistanceSettings & { updatedAt?: string }> {
    const doc = await this.db.collection('assistantSettings').doc('humanAssistance').get();
    if (!doc.exists) return defaults;
    const data = doc.data();
    return { ...updateHumanAssistanceSettingsSchema.parse({ thresholdPercent: data?.thresholdPercent, usernames: data?.usernames }), ...(typeof data?.updatedAt === 'string' ? { updatedAt: data.updatedAt } : {}) };
  }
  async saveSettings(input: HumanAssistanceSettings) {
    const value = { ...updateHumanAssistanceSettingsSchema.parse(input), updatedAt: now() };
    await this.db.collection('assistantSettings').doc('humanAssistance').set(value);
    return value;
  }
  async enroll(userId: string, chatId: string, username: string): Promise<boolean> {
    const settings = await this.settings();
    if (!settings.usernames.includes(username)) return false;
    await this.db.collection('humanResponders').doc(userId).set({ userId, chatId, username, enrolledAt: now() });
    return true;
  }
  async isConfiguredUsername(username: string): Promise<boolean> { return (await this.settings()).usernames.includes(username); }
  async responder(userId: string, chatId: string, username: string): Promise<Responder | undefined> {
    const [settings, doc] = await Promise.all([this.settings(), this.db.collection('humanResponders').doc(userId).get()]);
    const data = doc.data() as Responder | undefined;
    return data?.chatId === chatId && data.username === username && settings.usernames.includes(username) ? data : undefined;
  }
  async connected(settings?: HumanAssistanceSettings): Promise<Responder[]> {
    const effectiveSettings = settings ?? await this.settings();
    const snapshot = await this.db.collection('humanResponders').get();
    return snapshot.docs.map((doc) => doc.data() as Responder).filter((item) => effectiveSettings.usernames.includes(item.username));
  }
  async open(chatId: string, businessConnectionId: string | undefined, updateId: number, question: string, reason: HumanRequestDto['reason'], probability: number | undefined, thresholdPercent: number): Promise<{ request: HumanRequestDto; created: boolean }> {
    const conversationRef = this.db.collection('conversations').doc(chatId);
    const requestRef = this.db.collection('humanRequests').doc();
    return this.db.runTransaction(async (tx) => {
      const conversation = await tx.get(conversationRef);
      const currentId = conversation.data()?.activeHumanRequestId as string | undefined;
      if (currentId) {
        const current = await tx.get(this.db.collection('humanRequests').doc(currentId));
        if (current.exists && active(current.data()?.status as HumanRequestDto['status'])) return { request: humanRequestSchema.parse({ ...current.data(), id: current.id }), created: false };
      }
      const timestamp = now();
      const request: HumanRequestDto = { id: requestRef.id, conversationId: chatId, telegramChatId: chatId, telegramUpdateId: updateId, ...(businessConnectionId ? { businessConnectionId } : {}), status: 'open', reason, ...(probability !== undefined ? { probability } : {}), thresholdPercent, question: question.slice(0, 4000), queuedMessages: [], notifications: {}, acknowledgement: 'pending', createdAt: timestamp, updatedAt: timestamp };
      tx.create(requestRef, request);
      tx.set(conversationRef, { activeHumanRequestId: requestRef.id, updatedAt: timestamp }, { merge: true });
      return { request, created: true };
    });
  }
  async get(id: string): Promise<HumanRequestDto | undefined> {
    const ref = this.db.collection('humanRequests').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return undefined;
    const data = doc.data()!;
    if (data.status === 'sending' && typeof data.leaseUntil === 'number' && data.leaseUntil <= Date.now()) {
      await this.db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (fresh.data()?.status === 'sending' && fresh.data()?.leaseUntil <= Date.now()) tx.update(ref, { status: 'uncertain', updatedAt: now() });
      });
      return this.get(id);
    }
    return humanRequestSchema.parse(data);
  }
  async listOpen(): Promise<HumanRequestDto[]> {
    const snapshot = await this.db.collection('humanRequests').where('status', 'in', ['open', 'sending', 'uncertain']).get();
    const requests = await Promise.all(snapshot.docs.map((doc) => this.get(doc.id)));
    return requests.filter((request): request is HumanRequestDto => Boolean(request && active(request.status))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async queue(id: string, text: string): Promise<boolean> {
    const ref = this.db.collection('humanRequests').doc(id);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists || !active(doc.data()?.status as HumanRequestDto['status'])) return false;
      tx.update(ref, { queuedMessages: [...(doc.data()?.queuedMessages as string[] ?? []), text.slice(0, 4000)].slice(-20), updatedAt: now() });
      return true;
    });
  }
  async setDelivery(id: string, recipient: string | undefined, status: 'sending' | 'sent' | 'failed' | 'uncertain'): Promise<void> {
    const ref = this.db.collection('humanRequests').doc(id);
    await this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) return;
      const data = doc.data()!;
      if (recipient) tx.update(ref, { notifications: Object.fromEntries(Object.entries({ ...(data.notifications as Record<string, string> ?? {}), [recipient]: status }).slice(-200)), updatedAt: now() });
      else tx.update(ref, { acknowledgement: status, updatedAt: now() });
    });
  }
  async claimAnswer(id: string, actor: string): Promise<string | undefined> {
    const ref = this.db.collection('humanRequests').doc(id);
    const leaseId = randomUUID();
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (doc.data()?.status !== 'open') return undefined;
      tx.update(ref, { status: 'sending', answerActor: actor, leaseId, queuedCountAtClaim: (doc.data()?.queuedMessages as string[] ?? []).length, leaseUntil: Date.now() + 30_000, updatedAt: now() });
      return leaseId;
    });
  }
  async completeAnswer(id: string, leaseId: string, status: 'answered' | 'open' | 'uncertain', text?: string): Promise<boolean> {
    const ref = this.db.collection('humanRequests').doc(id);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (doc.data()?.status !== 'sending' || doc.data()?.leaseId !== leaseId) return false;
      const data = doc.data()!;
      const newerText = status === 'answered' && (data.queuedMessages as string[] ?? []).length > (data.queuedCountAtClaim as number ?? 0);
      tx.update(ref, { status: newerText ? 'open' : status, leaseId: FieldValue.delete(), leaseUntil: FieldValue.delete(), updatedAt: now(), ...(status === 'answered' ? { lastAnswer: text } : {}) });
      if (status === 'answered' && !newerText) tx.update(this.db.collection('conversations').doc(String(data.conversationId)), { activeHumanRequestId: FieldValue.delete(), updatedAt: now() });
      return true;
    });
  }
  async release(id: string, actor: string): Promise<boolean> {
    const ref = this.db.collection('humanRequests').doc(id);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists || !['open', 'uncertain'].includes(String(doc.data()?.status))) return false;
      tx.update(ref, { status: 'released', answerActor: actor, updatedAt: now() });
      tx.update(this.db.collection('conversations').doc(String(doc.data()?.conversationId)), { activeHumanRequestId: FieldValue.delete(), updatedAt: now() });
      return true;
    });
  }
}
