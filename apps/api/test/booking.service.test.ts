import { beforeAll, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { BookingConflictError } from '@booking/domain';
import { BookingService } from '../src/booking.service.js';
import { CalendarService } from '../src/calendar.js';
import { FirebaseAdminService } from '../src/firebase-admin.js';
import { BookingRepository } from '../src/repository.js';

const withEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
describe.skipIf(!withEmulator)('Firestore booking transactions', () => {
  beforeAll(async () => {
    if (!getApps().length) initializeApp({ projectId: 'demo-ai-massage' });
    const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ai-massage/databases/(default)/documents`, { method: 'DELETE' });
    expect(response.ok).toBe(true);
  });

  const setup = async () => {
    const repository = new BookingRepository(new FirebaseAdminService());
    await repository.saveService({ id: 'massage-60', name: 'Massage', description: '', durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH', enabled: true });
    return { repository, service: new BookingService(repository, new CalendarService()) };
  };

  it('allows only one concurrent reservation for a locked slot', async () => {
    const { service } = await setup();
    const input = { clientId: 'one', serviceId: 'massage-60', startAt: '2026-09-21T07:00:00.000Z', telegramChatId: '1' };
    const outcomes = await Promise.allSettled([service.create(input), service.create({ ...input, clientId: 'two', telegramChatId: '2' })]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({ reason: expect.any(BookingConflictError) });
  });

  it('releases locks after cancellation and preserves the original buffer', async () => {
    const { service, repository } = await setup();
    const input = { clientId: 'one', serviceId: 'massage-60', startAt: '2026-09-22T07:00:00.000Z', telegramChatId: '1' };
    const booking = await service.create(input);
    expect(booking).not.toHaveProperty('lockedSlots');
    expect(booking).not.toHaveProperty('bufferMinutes');
    expect(await repository.listLockedIntervals()).toContainEqual({ start: booking.startAt, end: '2026-09-22T08:15:00.000Z' });
    await service.cancel(booking.id);
    expect((await service.create({ ...input, clientId: 'two', telegramChatId: '2' })).id).toBeTruthy();
  });

  it('preserves the original booking when rescheduling conflicts', async () => {
    const { service, repository } = await setup();
    const first = await service.create({ clientId: 'one', serviceId: 'massage-60', startAt: '2026-09-23T07:00:00.000Z', telegramChatId: '1' });
    await service.create({ clientId: 'two', serviceId: 'massage-60', startAt: '2026-09-23T09:00:00.000Z', telegramChatId: '2' });
    await expect(service.reschedule(first.id, { startAt: '2026-09-23T09:00:00.000Z' })).rejects.toThrow(BookingConflictError);
    expect((await repository.getBooking(first.id))?.startAt).toBe(first.startAt);
  });

  it('claims each Telegram update once across repository instances', async () => {
    const left = new BookingRepository(new FirebaseAdminService());
    const right = new BookingRepository(new FirebaseAdminService());
    const outcomes = await Promise.all([left.claimTelegramUpdate(123), right.claimTelegramUpdate(123)]);
    expect(outcomes.sort()).toEqual([false, true]);
  });
  it('persists and resets the custom assistant prompt override', async () => {
    const repository = new BookingRepository(new FirebaseAdminService());
    expect(await repository.getAssistantPromptOverride()).toBeUndefined();
    const saved = await repository.saveAssistantPromptOverride('Use shorter replies.');
    expect(saved).toMatchObject({ prompt: 'Use shorter replies.', updatedAt: expect.any(String) });
    expect(await repository.getAssistantPromptOverride()).toEqual(saved);
    await repository.deleteAssistantPromptOverride();
    expect(await repository.getAssistantPromptOverride()).toBeUndefined();
  });
  it('persists service photos, rich caption entities, and inline URL buttons', async () => {
    const repository = new BookingRepository(new FirebaseAdminService());
    const service = { id: 'telegram-card', name: 'Massage', description: 'Assistant details', durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH', enabled: true, photoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo-ai-massage/o/service-photos%2Fmassage.jpg?alt=media&token=test', telegramCaption: { text: 'Classic massage', entities: [{ type: 'bold' as const, offset: 0, length: 7 }] }, telegramButtons: [[{ text: 'Book', url: 'https://example.com/book' }]] };
    await repository.saveService(service);
    expect((await getFirestore().collection('services').doc(service.id).get()).data()?.telegramButtons).toEqual([{ row: 0, text: 'Book', url: 'https://example.com/book' }]);
    expect(await repository.getService(service.id)).toEqual(service);
  });
  it('persists bot timing settings in the shared assistant settings collection', async () => {
    const repository = new BookingRepository(new FirebaseAdminService());
    expect(await repository.getBotSettingsOverride()).toBeUndefined();
    const saved = await repository.saveBotSettingsOverride({ maxReadDelayMs: 900, typingDelayPerSymbolMs: 350 });
    expect(saved).toMatchObject({ maxReadDelayMs: 900, typingDelayPerSymbolMs: 350, updatedAt: expect.any(String) });
    expect(await repository.getBotSettingsOverride()).toEqual(saved);
  });
  it('persists a normalized stakeholder email allowlist', async () => {
    const repository = new BookingRepository(new FirebaseAdminService());
    expect(await repository.getAdminAccessOverride()).toBeUndefined();
    const saved = await repository.saveAdminAccessOverride(['Stakeholder@Example.com']);
    expect(saved).toMatchObject({ emails: ['stakeholder@example.com'], updatedAt: expect.any(String) });
    expect((await getFirestore().collection('assistantSettings').doc('adminAccess').get()).data()?.emails).toEqual(['stakeholder@example.com']);
    expect(await repository.getAdminAccessOverride()).toEqual(saved);
  });
  it('preserves chosen price, duration and buffer on reschedule after catalog edits', async () => {
    const { repository, service } = await setup();
    const original = (await repository.getService('massage-60'))!;
    await repository.saveService({ ...original, durationOptions: [{ durationMinutes: 90, price: 2000 }] });
    const booking = await service.create({ clientId: 'options', telegramChatId: 'options', serviceId: original.id, durationMinutes: 90, startAt: '2099-01-01T09:00:00.000Z' });
    expect(booking).toMatchObject({ durationMinutes: 90, price: 2000, currency: 'UAH' });
    await repository.saveService({ ...original, durationMinutes: 30, price: 999, bufferMinutes: 0 });
    const moved = await service.reschedule(booking.id, { startAt: '2099-01-02T09:00:00.000Z' });
    expect(moved).toMatchObject({ durationMinutes: 90, price: 2000, currency: 'UAH' });
    expect(Date.parse(moved.endAt) - Date.parse(moved.startAt)).toBe(90 * 60_000);
    const stored = (await getFirestore().collection('bookings').doc(booking.id).get()).data()!;
    expect(stored.bufferMinutes).toBe(15);
    expect(stored.lockedSlots).toHaveLength(7);
  });
  it('persists pending actions and returns only the latest 20 conversation messages', async () => {
    const { repository } = await setup();
    const now = new Date().toISOString();
    const conversation = { telegramChatId: 'history-test', clientId: 'test', assistantEnabled: true, state: 'active', summary: '', createdAt: now, updatedAt: now };
    await repository.saveConversation({ ...conversation, pendingAction: { name: 'cancel_booking', arguments: { bookingId: 'test-booking' }, expiresAt: now } });
    expect((await repository.getConversation('history-test'))?.pendingAction?.name).toBe('cancel_booking');
    for (let index = 0; index < 22; index++) await repository.appendMessage('history-test', 'user', `message-${index}`);
    const messages = await repository.listMessages('history-test');
    expect(messages).toHaveLength(20);
    expect(messages[19]?.content).toBe('message-21');
    await repository.saveConversation(conversation);
    expect((await repository.getConversation('history-test'))?.pendingAction).toBeUndefined();
  });

});
