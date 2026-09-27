import { systemOneSettingsSchema, type SystemOneSettings } from '@booking/contracts';
import { isDeepStrictEqual } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { FieldValue, getFirestore, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import {
  debugEventsSchema, type DebugEvent, type AssistantPromptId, availabilityRuleSchema, bookingSchema, botSettingsSchema, conversationSchema, scheduleExceptionSchema, serviceSchema, updateAdminAccessSchema,
  type AvailabilityRuleDto, type BookingDto, type BotSettings, type ConversationDto, type ScheduleExceptionDto, type ServiceDto,
} from '@booking/contracts';
import { BookingConflictError, BookingNotFoundError, lockedSlotKeys, serviceEndAt } from '@booking/domain';
import { FirebaseAdminService } from './firebase-admin.js';

export type CreateStoredBooking = Omit<BookingDto, 'id' | 'createdAt' | 'updatedAt'> & { lockedSlots: string[]; bufferMinutes: number };
export type BookingOperation = { id: string; kind: 'create' | 'reschedule' | 'cancel'; targetStartAt?: string; targetEndAt?: string; leaseId?: string; leaseUntil?: number };
type StoredBooking = BookingDto & { lockedSlots: string[]; bufferMinutes: number; operation?: BookingOperation };
type StoredTelegramButton = { row: number; text: string; url: string };
const withoutUndefined = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const serviceFromDocument = (id: string, data: DocumentData): ServiceDto => {
  const { telegramButtons: storedButtons, ...fields } = data;
  let telegramButtons: ServiceDto['telegramButtons'];
  if (Array.isArray(storedButtons)) {
    if (storedButtons.every((button): button is StoredTelegramButton => Boolean(button && typeof button === 'object' && Number.isInteger(button.row) && typeof button.text === 'string' && typeof button.url === 'string'))) {
      const rows = new Map<number, Array<{ text: string; url: string }>>();
      for (const button of storedButtons) rows.set(button.row, [...(rows.get(button.row) ?? []), { text: button.text, url: button.url }]);
      telegramButtons = [...rows.entries()].sort(([left], [right]) => left - right).map(([, buttons]) => buttons);
    } else if (storedButtons.every(Array.isArray)) {
      telegramButtons = storedButtons;
    }
  }
  return serviceSchema.parse({ ...fields, ...(telegramButtons === undefined ? {} : { telegramButtons }), id });
};
const serviceDocument = (service: ServiceDto): DocumentData => {
  const { telegramButtons, ...fields } = service;
  return withoutUndefined({
    ...fields,
    ...(telegramButtons === undefined ? {} : {
      telegramButtons: telegramButtons.flatMap((buttons, row) => buttons.map(({ text, url }) => ({ row, text, url }))),
    }),
  });
};
const storedBooking = (id: string, data: DocumentData | undefined): StoredBooking => ({
  ...bookingSchema.parse({ ...data, id }),
  operation: data?.operation as BookingOperation | undefined,
  lockedSlots: Array.isArray(data?.lockedSlots) ? data.lockedSlots as string[] : [],
  bufferMinutes: typeof data?.bufferMinutes === 'number' ? data.bufferMinutes : 0,
});

@Injectable()
export class BookingRepository {
  private readonly db: Firestore;

  constructor(_firebase: FirebaseAdminService) { this.db = getFirestore(); }

  private promptDocumentId(id: AssistantPromptId): string {
    return {
      routing: 'systemOneRoutingPrompt', approval: 'systemOneApprovalPrompt', probability: 'systemOneProbabilityPrompt',
      general: 'prompt', 'booking-conversation': 'bookingConversationPrompt', 'booking-planner': 'bookingPrompt',
    }[id];
  }
  async getPromptOverride(id: AssistantPromptId): Promise<{ prompt: string; updatedAt: string } | undefined> {
    const data = (await this.db.collection('assistantSettings').doc(this.promptDocumentId(id)).get()).data();
    return typeof data?.prompt === 'string' && typeof data.updatedAt === 'string' ? { prompt: data.prompt, updatedAt: data.updatedAt } : undefined;
  }
  async getRoutingPromptOverride(): Promise<{ instructions: string; general?: string; booking?: string; updatedAt: string } | undefined> {
    const data = (await this.db.collection('assistantSettings').doc('systemOneRoutingPrompt').get()).data();
    const instructions = typeof data?.instructions === 'string' ? data.instructions : data?.prompt;
    if (typeof instructions !== 'string' || typeof data?.updatedAt !== 'string') return undefined;
    return { instructions, ...(typeof data.general === 'string' ? { general: data.general } : {}), ...(typeof data.booking === 'string' ? { booking: data.booking } : {}), updatedAt: data.updatedAt };
  }
  async saveRoutingPromptOverride(value: { instructions: string; general: string; booking: string }) {
    const saved = { ...value, updatedAt: new Date().toISOString() };
    await this.db.collection('assistantSettings').doc('systemOneRoutingPrompt').set(saved);
    return saved;
  }
  async savePromptOverride(id: AssistantPromptId, prompt: string): Promise<{ prompt: string; updatedAt: string }> {
    const value = { prompt, updatedAt: new Date().toISOString() };
    await this.db.collection('assistantSettings').doc(this.promptDocumentId(id)).set(value);
    return value;
  }
  async deletePromptOverride(id: AssistantPromptId): Promise<void> {
    await this.db.collection('assistantSettings').doc(this.promptDocumentId(id)).delete();
  }

  async listServices(): Promise<ServiceDto[]> {
    const snapshot = await this.db.collection('services').get();
    return snapshot.docs.map((doc) => serviceFromDocument(doc.id, doc.data()));
  }
  async getService(id: string): Promise<ServiceDto | undefined> {
    const doc = await this.db.collection('services').doc(id).get();
    return doc.exists ? serviceFromDocument(doc.id, doc.data()!) : undefined;
  }
  async saveService(service: ServiceDto): Promise<ServiceDto> {
    await this.db.collection('services').doc(service.id).set(serviceDocument(service));
    return service;
  }
  async listBookings(): Promise<BookingDto[]> {
    const snapshot = await this.db.collection('bookings').get();
    return snapshot.docs.map((doc) => bookingSchema.parse({ ...doc.data(), id: doc.id })).sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
  async getBooking(id: string): Promise<BookingDto | undefined> {
    const doc = await this.db.collection('bookings').doc(id).get();
    return doc.exists ? bookingSchema.parse({ ...doc.data(), id: doc.id }) : undefined;
  }
  async getBookingTiming(id: string): Promise<{ durationMinutes: number; bufferMinutes: number }> {
    const doc = await this.db.collection('bookings').doc(id).get();
    if (!doc.exists) throw new BookingNotFoundError();
    const booking = storedBooking(id, doc.data());
    return { durationMinutes: booking.durationMinutes ?? (Date.parse(booking.endAt) - Date.parse(booking.startAt)) / 60_000, bufferMinutes: booking.bufferMinutes };
  }
  async createBooking(input: CreateStoredBooking): Promise<BookingDto> {
    const bookingRef = this.db.collection('bookings').doc();
    const slotRefs = input.lockedSlots.map((slot) => this.db.collection('bookingSlots').doc(slot));
    const now = new Date().toISOString();
    const booking: StoredBooking = { ...input, id: bookingRef.id, createdAt: now, updatedAt: now,
      ...(input.calendarOperation === 'create' ? { operation: { id: randomUUID(), kind: 'create' as const }, googleCalendarEventId: createHash('sha256').update(`booking:${bookingRef.id}`).digest('hex') } : {}),
    };
    await this.db.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(slotRefs.map((ref) => transaction.get(ref)));
      if (snapshots.some((snapshot) => snapshot.exists)) throw new BookingConflictError();
      transaction.create(bookingRef, withoutUndefined(booking));
      for (const ref of slotRefs) transaction.create(ref, { bookingId: bookingRef.id });
    });
    return bookingSchema.parse(booking);
  }
  async updateBookingStatus(id: string, status: BookingDto['status']): Promise<BookingDto> {
    if (status === 'cancelled' || status === 'confirmed' || status === 'pending') throw new BookingConflictError();
    const bookingRef = this.db.collection('bookings').doc(id);
    return this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(bookingRef);
      if (!doc.exists) throw new BookingNotFoundError();
      if (doc.data()?.operation || doc.data()?.status !== 'confirmed') throw new BookingConflictError();
      const changed = { ...storedBooking(id, doc.data()), status, updatedAt: new Date().toISOString() };
      transaction.set(bookingRef, withoutUndefined(changed));
      return bookingSchema.parse(changed);
    });
  }
  async listLockedIntervals(excludeBookingId?: string): Promise<{ start: string; end: string }[]> {
    const snapshot = await this.db.collection('bookings').get();
    return snapshot.docs.filter((doc) => doc.id !== excludeBookingId).map((doc) => storedBooking(doc.id, doc.data())).filter((booking) => booking.status !== 'cancelled').flatMap((booking) => [
      { start: booking.startAt, end: new Date(Date.parse(booking.endAt) + booking.bufferMinutes * 60_000).toISOString() },
      ...(booking.operation?.targetStartAt && booking.operation.targetEndAt ? [{ start: booking.operation.targetStartAt, end: new Date(Date.parse(booking.operation.targetEndAt) + booking.bufferMinutes * 60_000).toISOString() }] : []),
    ]);
  }
  async beginOperation(id: string, kind: 'reschedule' | 'cancel', targetStartAt?: string, calendarId?: string) {
    const ref = this.db.collection('bookings').doc(id);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new BookingNotFoundError();
      const booking = storedBooking(id, doc.data());
      if (booking.operation || booking.status !== 'confirmed') throw new BookingConflictError();
      const targetEndAt = targetStartAt ? serviceEndAt(targetStartAt, { durationMinutes: booking.durationMinutes ?? (Date.parse(booking.endAt) - Date.parse(booking.startAt)) / 60000 }) : undefined;
      const targetKeys = targetStartAt && targetEndAt ? lockedSlotKeys('default', targetStartAt, targetEndAt, booking.bufferMinutes) : [];
      const refs = targetKeys.map((key) => this.db.collection('bookingSlots').doc(key));
      const slots = await Promise.all(refs.map((slot) => tx.get(slot)));
      if (slots.some((slot) => slot.exists && slot.data()?.bookingId !== id)) throw new BookingConflictError();
      slots.forEach((slot, index) => { if (!slot.exists) tx.create(refs[index]!, { bookingId: id }); });
      const changed: StoredBooking = { ...booking, googleCalendarId: booking.googleCalendarId ?? calendarId, lockedSlots: [...new Set([...booking.lockedSlots, ...targetKeys])], calendarOperation: kind, calendarSyncStatus: 'pending', operation: { id: randomUUID(), kind, targetStartAt, targetEndAt }, updatedAt: new Date().toISOString() };
      tx.set(ref, withoutUndefined(changed));
      return bookingSchema.parse(changed);
    });
  }
  async claimOperation(id: string) {
    const ref = this.db.collection('bookings').doc(id);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new BookingNotFoundError();
      const booking = storedBooking(id, doc.data()); const operation = booking.operation;
      if (!operation || (operation.leaseUntil ?? 0) > Date.now()) throw new BookingConflictError();
      const claimed = { ...operation, leaseId: randomUUID(), leaseUntil: Date.now() + 10 * 60000 };
      tx.update(ref, { operation: withoutUndefined(claimed), calendarSyncStatus: 'pending' });
      return { booking: bookingSchema.parse(booking), operation: claimed };
    });
  }
  async failOperation(id: string, leaseId: string) {
    const ref = this.db.collection('bookings').doc(id);
    await this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref); const operation = doc.data()?.operation as BookingOperation | undefined;
      if (operation?.leaseId !== leaseId) return;
      tx.update(ref, { operation: withoutUndefined({ ...operation, leaseId: undefined, leaseUntil: undefined }), calendarSyncStatus: 'failed', updatedAt: new Date().toISOString() });
    });
  }
  async finishOperation(id: string, leaseId: string) {
    const ref = this.db.collection('bookings').doc(id);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref); const booking = storedBooking(id, doc.data()); const operation = booking.operation;
      if (!operation || operation.leaseId !== leaseId) throw new BookingConflictError();
      const startAt = operation.targetStartAt ?? booking.startAt; const endAt = operation.targetEndAt ?? booking.endAt;
      const keep = operation.kind === 'cancel' ? [] : lockedSlotKeys('default', startAt, endAt, booking.bufferMinutes);
      const release = booking.lockedSlots.filter((key) => !keep.includes(key)).map((key) => this.db.collection('bookingSlots').doc(key));
      const docs = await Promise.all(release.map((slot) => tx.get(slot)));
      docs.forEach((slot, index) => { if (slot.data()?.bookingId === id) tx.delete(release[index]!); });
      const changed: StoredBooking = { ...booking, startAt, endAt, status: operation.kind === 'cancel' ? 'cancelled' : 'confirmed', calendarSyncStatus: 'synced', lockedSlots: keep, operation: undefined, calendarOperation: undefined, updatedAt: new Date().toISOString() };
      tx.set(ref, withoutUndefined(changed));
      return bookingSchema.parse(changed);
    });
  }
  async getRules(): Promise<AvailabilityRuleDto[]> {
    const snapshot = await this.db.collection('availabilityRules').get();
    return snapshot.docs.map((doc) => availabilityRuleSchema.parse({ ...doc.data(), id: doc.id }));
  }
  async setRules(rules: AvailabilityRuleDto[]): Promise<void> {
    const collection = this.db.collection('availabilityRules');
    const existing = await collection.get();
    const batch = this.db.batch();
    for (const doc of existing.docs) if (!rules.some((rule) => rule.id === doc.id)) batch.delete(doc.ref);
    for (const rule of rules) batch.set(collection.doc(rule.id), withoutUndefined(rule));
    await batch.commit();
  }
  async getExceptions(): Promise<ScheduleExceptionDto[]> {
    const snapshot = await this.db.collection('scheduleExceptions').get();
    return snapshot.docs.map((doc) => scheduleExceptionSchema.parse({ ...doc.data(), id: doc.id }));
  }
  async saveException(item: ScheduleExceptionDto): Promise<ScheduleExceptionDto> {
    await this.db.collection('scheduleExceptions').doc(item.id).set(withoutUndefined(item));
    return item;
  }
  async deleteException(id: string): Promise<void> { await this.db.collection('scheduleExceptions').doc(id).delete(); }
  async getConversation(chatId: string): Promise<ConversationDto | undefined> {
    const doc = await this.db.collection('conversations').doc(chatId).get();
    return doc.exists ? conversationSchema.parse({ ...doc.data(), telegramChatId: doc.id }) : undefined;
  }
  async ensureOpenAiConversation(chatId: string, clientId: string | undefined, candidate: string): Promise<string> {
    const ref = this.db.collection('conversations').doc(chatId);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const data = doc.data();
      if (!data || data.clientId !== clientId) throw new Error('Telegram conversation identity changed');
      if (typeof data.openaiConversationId === 'string' && data.openaiConversationId) return data.openaiConversationId;
      tx.update(ref, { openaiConversationId: candidate });
      return candidate;
    });
  }
  async replaceOpenAiConversation(chatId: string, clientId: string, expected: string, candidate: string): Promise<void> {
    const ref = this.db.collection('conversations').doc(chatId);
    await this.db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data();
      if (!data || data.clientId !== clientId || data.openaiConversationId !== expected || !data.assistantEnabled || data.activeHumanRequestId || (data.humanTakeoverUntil && data.humanTakeoverUntil > new Date().toISOString())) {
        throw new Error('Telegram conversation changed or paused during recovery');
      }
      tx.update(ref, { openaiConversationId: candidate });
    });
  }
  async resetTelegramConversationIdentity(conversation: ConversationDto): Promise<void> {
    const ref = this.db.collection('conversations').doc(conversation.telegramChatId);
    await this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (doc.exists && doc.data()?.clientId === conversation.clientId) return;
      tx.set(ref, withoutUndefined(conversation));
    });
  }
  async saveConversation(conversation: ConversationDto): Promise<ConversationDto> {
    const ref = this.db.collection('conversations').doc(conversation.telegramChatId);
    await this.db.runTransaction(async (tx) => {
      const existing = (await tx.get(ref)).data() ?? {};
      const merged = { ...existing, ...withoutUndefined(conversation) };
      if (conversation.pendingAction === undefined) delete merged.pendingAction;
      tx.set(ref, merged);
    });
    return conversation;
  }
  /** Update activity without copying stale proposal or automation state back into storage. */
  async touchConversation(conversation: ConversationDto): Promise<void> {
    const ref = this.db.collection('conversations').doc(conversation.telegramChatId);
    await this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (doc.exists) tx.update(ref, { updatedAt: conversation.updatedAt });
      else tx.set(ref, withoutUndefined(conversation));
    });
  }
  /** Compare-and-set: staging, rejection and consumption all bind to one proposal snapshot. */
  async replacePendingAction(chatId: string, clientId: string, expected: ConversationDto['pendingAction'], replacement: ConversationDto['pendingAction'], options: { requireUnexpired?: boolean } = {}): Promise<boolean> {
    const ref = this.db.collection('conversations').doc(chatId);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) return false;
      const current = conversationSchema.parse({ ...doc.data(), telegramChatId: chatId });
      const now = new Date().toISOString();
      if (current.clientId !== clientId || !current.assistantEnabled || current.activeHumanRequestId || (current.humanTakeoverUntil && current.humanTakeoverUntil > now)) return false;
      if (!isDeepStrictEqual(current.pendingAction, expected)) return false;
      if (options.requireUnexpired && (!current.pendingAction || current.pendingAction.expiresAt <= now)) return false;
      tx.update(ref, { pendingAction: replacement ? withoutUndefined(replacement) : FieldValue.delete(), updatedAt: now });
      return true;
    });
  }
  async listConversations(): Promise<ConversationDto[]> {
    const snapshot = await this.db.collection('conversations').get();
    return snapshot.docs.map((doc) => conversationSchema.parse({ ...doc.data(), telegramChatId: doc.id })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async listMessages(chatId: string): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    const snapshot = await this.db.collection('conversations').doc(chatId).collection('messages').orderBy('createdAt', 'desc').limit(20).get();
    return snapshot.docs.reverse().map((doc) => ({ role: doc.data().role === 'user' ? 'user' as const : 'assistant' as const, content: String(doc.data().text) }));
  }
  async appendMessage(chatId: string, role: 'user' | 'assistant' | 'human', text: string): Promise<void> {
    await this.db.collection('conversations').doc(chatId).collection('messages').add({ role, text, createdAt: new Date().toISOString() });
  }
  async getKnowledgeBaseOverride(): Promise<{ content: string; updatedAt: string } | undefined> {
    const doc = await this.db.collection('assistantSettings').doc('knowledgeBase').get();
    if (!doc.exists) return undefined;
    const data = doc.data();
    return typeof data?.content === 'string' && typeof data.updatedAt === 'string' ? { content: data.content, updatedAt: data.updatedAt } : undefined;
  }
  async saveKnowledgeBaseOverride(content: string): Promise<{ content: string; updatedAt: string }> {
    const value = { content, updatedAt: new Date().toISOString() };
    await this.db.collection('assistantSettings').doc('knowledgeBase').set(value);
    return value;
  }
  async deleteKnowledgeBaseOverride(): Promise<void> {
    await this.db.collection('assistantSettings').doc('knowledgeBase').delete();
  }
  async getBookingPromptOverride(): Promise<{ prompt: string; updatedAt: string } | undefined> {
    const doc = await this.db.collection('assistantSettings').doc('bookingPrompt').get();
    const data = doc.data();
    return typeof data?.prompt === 'string' && typeof data.updatedAt === 'string' ? { prompt: data.prompt, updatedAt: data.updatedAt } : undefined;
  }
  async saveBookingPromptOverride(prompt: string) {
    const value = { prompt, updatedAt: new Date().toISOString() };
    await this.db.collection('assistantSettings').doc('bookingPrompt').set(value);
    return value;
  }
  async deleteBookingPromptOverride() { await this.db.collection('assistantSettings').doc('bookingPrompt').delete(); }
  async appendDebugEvent(event: DebugEvent) {
    const ref = this.db.collection('assistantDiagnostics').doc('recent');
    await this.db.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data()?.events;
      const events = Array.isArray(current) ? current : [];
      tx.set(ref, { events: withoutUndefined([...events, event].slice(-200)) });
    });
  }
  async listDebugEvents(): Promise<DebugEvent[]> {
    const data = (await this.db.collection('assistantDiagnostics').doc('recent').get()).data();
    return debugEventsSchema.parse(data?.events ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async getAssistantPromptOverride(): Promise<{ prompt: string; updatedAt: string } | undefined> {
    const doc = await this.db.collection('assistantSettings').doc('prompt').get();
    if (!doc.exists) return undefined;
    const data = doc.data();
    return typeof data?.prompt === 'string' && typeof data.updatedAt === 'string' ? { prompt: data.prompt, updatedAt: data.updatedAt } : undefined;
  }
  async saveAssistantPromptOverride(prompt: string): Promise<{ prompt: string; updatedAt: string }> {
    const value = { prompt, updatedAt: new Date().toISOString() };
    await this.db.collection('assistantSettings').doc('prompt').set(value);
    return value;
  }
  async deleteAssistantPromptOverride(): Promise<void> {
    await this.db.collection('assistantSettings').doc('prompt').delete();
  }
  async getSystemOneSettings(): Promise<SystemOneSettings> {
    const doc = await this.db.collection('assistantSettings').doc('systemOne').get();
    if (!doc.exists) return { provider: 'openai' };
    return systemOneSettingsSchema.parse({ provider: doc.data()?.provider });
  }
  async saveSystemOneSettings(settings: SystemOneSettings): Promise<SystemOneSettings> {
    const value = systemOneSettingsSchema.parse(settings);
    await this.db.collection('assistantSettings').doc('systemOne').set({ ...value, updatedAt: new Date().toISOString() });
    return value;
  }
  async getBotSettingsOverride(): Promise<(BotSettings & { updatedAt: string }) | undefined> {
    const doc = await this.db.collection('assistantSettings').doc('behavior').get();
    if (!doc.exists) return undefined;
    const data = doc.data();
    if (typeof data?.updatedAt !== 'string') return undefined;
    return { ...botSettingsSchema.parse(data), updatedAt: data.updatedAt };
  }
  async saveBotSettingsOverride(settings: BotSettings): Promise<BotSettings & { updatedAt: string }> {
    const value = { ...botSettingsSchema.parse(settings), updatedAt: new Date().toISOString() };
    await this.db.collection('assistantSettings').doc('behavior').set(withoutUndefined(value));
    return value;
  }
  async getAdminAccessOverride(): Promise<{ emails: string[]; updatedAt: string } | undefined> {
    const doc = await this.db.collection('assistantSettings').doc('adminAccess').get();
    if (!doc.exists) return undefined;
    const data = doc.data();
    if (typeof data?.updatedAt !== 'string') return undefined;
    return { ...updateAdminAccessSchema.parse({ emails: data.emails }), updatedAt: data.updatedAt };
  }
  async saveAdminAccessOverride(emails: string[]): Promise<{ emails: string[]; updatedAt: string }> {
    const value = { ...updateAdminAccessSchema.parse({ emails }), updatedAt: new Date().toISOString() };
    await this.db.collection('assistantSettings').doc('adminAccess').set(withoutUndefined(value));
    return value;
  }
  async claimTelegramUpdate(updateId: number): Promise<boolean> {
    const ref = this.db.collection('telegramUpdates').doc(String(updateId));
    return this.db.runTransaction(async (transaction) => {
      if ((await transaction.get(ref)).exists) return false;
      transaction.create(ref, { receivedAt: new Date().toISOString() });
      return true;
    });
  }
}
