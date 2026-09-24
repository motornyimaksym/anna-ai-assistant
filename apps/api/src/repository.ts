import { Injectable } from '@nestjs/common';
import { getFirestore, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import {
  availabilityRuleSchema, bookingSchema, botSettingsSchema, conversationSchema, scheduleExceptionSchema, serviceSchema,
  type AvailabilityRuleDto, type BookingDto, type BotSettings, type ConversationDto, type ScheduleExceptionDto, type ServiceDto,
} from '@booking/contracts';
import { BookingConflictError, BookingNotFoundError } from '@booking/domain';
import { FirebaseAdminService } from './firebase-admin.js';

export type CreateStoredBooking = Omit<BookingDto, 'id' | 'createdAt' | 'updatedAt'> & { lockedSlots: string[]; bufferMinutes: number };
type StoredBooking = BookingDto & { lockedSlots: string[]; bufferMinutes: number };
const withoutUndefined = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const storedBooking = (id: string, data: DocumentData | undefined): StoredBooking => ({
  ...bookingSchema.parse({ ...data, id }),
  lockedSlots: Array.isArray(data?.lockedSlots) ? data.lockedSlots as string[] : [],
  bufferMinutes: typeof data?.bufferMinutes === 'number' ? data.bufferMinutes : 0,
});

@Injectable()
export class BookingRepository {
  private readonly db: Firestore;

  constructor(_firebase: FirebaseAdminService) { this.db = getFirestore(); }

  async listServices(): Promise<ServiceDto[]> {
    const snapshot = await this.db.collection('services').get();
    return snapshot.docs.map((doc) => serviceSchema.parse({ ...doc.data(), id: doc.id }));
  }
  async getService(id: string): Promise<ServiceDto | undefined> {
    const doc = await this.db.collection('services').doc(id).get();
    return doc.exists ? serviceSchema.parse({ ...doc.data(), id: doc.id }) : undefined;
  }
  async saveService(service: ServiceDto): Promise<ServiceDto> {
    await this.db.collection('services').doc(service.id).set(withoutUndefined(service));
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
  async createBooking(input: CreateStoredBooking): Promise<BookingDto> {
    const bookingRef = this.db.collection('bookings').doc();
    const slotRefs = input.lockedSlots.map((slot) => this.db.collection('bookingSlots').doc(slot));
    const now = new Date().toISOString();
    const booking: StoredBooking = { ...input, id: bookingRef.id, createdAt: now, updatedAt: now };
    await this.db.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(slotRefs.map((ref) => transaction.get(ref)));
      if (snapshots.some((snapshot) => snapshot.exists)) throw new BookingConflictError();
      transaction.create(bookingRef, withoutUndefined(booking));
      for (const ref of slotRefs) transaction.create(ref, { bookingId: bookingRef.id });
    });
    return bookingSchema.parse(booking);
  }
  async cancelBooking(id: string): Promise<BookingDto> {
    const bookingRef = this.db.collection('bookings').doc(id);
    return this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(bookingRef);
      if (!doc.exists) throw new BookingNotFoundError();
      const booking = storedBooking(id, doc.data());
      if (booking.status === 'cancelled') return bookingSchema.parse(booking);
      const slotRefs = booking.lockedSlots.map((slot) => this.db.collection('bookingSlots').doc(slot));
      const slots = await Promise.all(slotRefs.map((ref) => transaction.get(ref)));
      const changed: StoredBooking = { ...booking, status: 'cancelled', updatedAt: new Date().toISOString() };
      transaction.set(bookingRef, withoutUndefined(changed));
      slots.forEach((slot, index) => { if (slot.data()?.bookingId === id) transaction.delete(slotRefs[index]!); });
      return bookingSchema.parse(changed);
    });
  }
  async updateBookingStatus(id: string, status: BookingDto['status']): Promise<BookingDto> {
    if (status === 'cancelled') return this.cancelBooking(id);
    const bookingRef = this.db.collection('bookings').doc(id);
    return this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(bookingRef);
      if (!doc.exists) throw new BookingNotFoundError();
      const changed = { ...storedBooking(id, doc.data()), status, updatedAt: new Date().toISOString() };
      transaction.set(bookingRef, withoutUndefined(changed));
      return bookingSchema.parse(changed);
    });
  }
  async rescheduleBooking(id: string, startAt: string, endAt: string, slots: string[]): Promise<BookingDto> {
    const bookingRef = this.db.collection('bookings').doc(id);
    return this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(bookingRef);
      if (!doc.exists) throw new BookingNotFoundError();
      const booking = storedBooking(id, doc.data());
      if (booking.status === 'cancelled') throw new BookingConflictError();
      const allKeys = [...new Set([...booking.lockedSlots, ...slots])];
      const refs = allKeys.map((slot) => this.db.collection('bookingSlots').doc(slot));
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      const current = new Map(allKeys.map((key, index) => [key, snapshots[index]?.data()?.bookingId as string | undefined]));
      if (slots.some((slot) => current.get(slot) && current.get(slot) !== id)) throw new BookingConflictError();
      const changed: StoredBooking = { ...booking, startAt, endAt, lockedSlots: slots, calendarSyncStatus: 'pending', updatedAt: new Date().toISOString() };
      for (const key of booking.lockedSlots) if (!slots.includes(key) && current.get(key) === id) transaction.delete(this.db.collection('bookingSlots').doc(key));
      for (const key of slots) if (!current.get(key)) transaction.create(this.db.collection('bookingSlots').doc(key), { bookingId: id });
      transaction.set(bookingRef, withoutUndefined(changed));
      return bookingSchema.parse(changed);
    });
  }
  async setCalendarSync(id: string, status: BookingDto['calendarSyncStatus'], eventId?: string): Promise<void> {
    await this.db.collection('bookings').doc(id).update(withoutUndefined({ calendarSyncStatus: status, googleCalendarEventId: eventId, updatedAt: new Date().toISOString() }));
  }
  async listLockedIntervals(): Promise<{ start: string; end: string }[]> {
    const snapshot = await this.db.collection('bookings').get();
    return snapshot.docs.map((doc) => storedBooking(doc.id, doc.data())).filter((booking) => booking.status !== 'cancelled').map((booking) => ({ start: booking.startAt, end: new Date(Date.parse(booking.endAt) + booking.bufferMinutes * 60_000).toISOString() }));
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
  async saveConversation(conversation: ConversationDto): Promise<ConversationDto> {
    await this.db.collection('conversations').doc(conversation.telegramChatId).set(withoutUndefined(conversation));
    return conversation;
  }
  async listConversations(): Promise<ConversationDto[]> {
    const snapshot = await this.db.collection('conversations').get();
    return snapshot.docs.map((doc) => conversationSchema.parse({ ...doc.data(), telegramChatId: doc.id })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async listMessages(chatId: string): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    const snapshot = await this.db.collection('conversations').doc(chatId).collection('messages').orderBy('createdAt', 'desc').limit(20).get();
    return snapshot.docs.reverse().map((doc) => ({ role: doc.data().role as 'user' | 'assistant', content: String(doc.data().text) }));
  }
  async appendMessage(chatId: string, role: 'user' | 'assistant', text: string): Promise<void> {
    await this.db.collection('conversations').doc(chatId).collection('messages').add({ role, text, createdAt: new Date().toISOString() });
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
  async claimTelegramUpdate(updateId: number): Promise<boolean> {
    const ref = this.db.collection('telegramUpdates').doc(String(updateId));
    return this.db.runTransaction(async (transaction) => {
      if ((await transaction.get(ref)).exists) return false;
      transaction.create(ref, { receivedAt: new Date().toISOString() });
      return true;
    });
  }
}
