import { beforeAll, describe, expect, it, vi } from 'vitest';
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
    const events = new Map<string, unknown>();
    const calendar = {
      destination: async () => 'test-calendar',
      getBusyIntervals: vi.fn(async () => []),
      verifyBookingEvent: vi.fn(async (booking: { id: string }) => events.has(booking.id)),
      createBookingEvent: vi.fn(async (booking: { id: string }) => { events.set(booking.id, booking); }),
      updateBookingEvent: vi.fn(async (booking: { id: string }) => { events.set(booking.id, booking); }),
      deleteBookingEvent: vi.fn(async () => {}),
    };
    return { repository, calendar, service: new BookingService(repository, calendar as unknown as CalendarService) };
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

  it('retains pending create locks on ambiguous writes and recovers without another event', async () => {
    const { service, repository, calendar } = await setup();
    calendar.createBookingEvent.mockImplementationOnce(async () => { throw new Error('lost response'); });
    const input = { clientId: 'failure', telegramChatId: 'failure', serviceId: 'massage-60', startAt: '2099-02-01T09:00:00Z' };
    await expect(service.create(input)).rejects.toThrow('human review');
    const pending = (await repository.listBookings()).find((booking) => booking.clientId === 'failure')!;
    expect(pending).toMatchObject({ status: 'pending', calendarOperation: 'create', calendarSyncStatus: 'failed' });
    await expect(service.create(input)).rejects.toThrow(BookingConflictError);
    calendar.verifyBookingEvent.mockResolvedValueOnce(true);
    expect(await service.retry(pending.id)).toMatchObject({ status: 'confirmed', calendarSyncStatus: 'synced' });
    expect(calendar.createBookingEvent).toHaveBeenCalledTimes(1);
  });

  it('holds old and new intervals until reschedule succeeds, then releases old locks', async () => {
    const { service, repository, calendar } = await setup();
    const input = { clientId: 'move', telegramChatId: 'move', serviceId: 'massage-60', startAt: '2099-03-01T09:00:00Z' };
    const booking = await service.create(input);
    calendar.updateBookingEvent.mockRejectedValueOnce(new Error('timeout'));
    await expect(service.reschedule(booking.id, { startAt: '2099-03-02T09:00:00Z' })).rejects.toThrow('human review');
    expect((await repository.getBooking(booking.id))?.startAt).toBe(input.startAt);
    await expect(service.create({ ...input, startAt: '2099-03-02T09:00:00Z' })).rejects.toThrow(BookingConflictError);
    const moved = await service.retry(booking.id);
    expect(moved.startAt).toBe('2099-03-02T09:00:00Z');
    expect((await service.create(input)).status).toBe('confirmed');
  });

  it('retains cancellation locks on failure and prevents concurrent operation claims', async () => {
    const { service, repository, calendar } = await setup();
    const input = { clientId: 'cancel-failure', telegramChatId: 'cancel', serviceId: 'massage-60', startAt: '2099-04-01T09:00:00Z' };
    const booking = await service.create(input);
    calendar.deleteBookingEvent.mockRejectedValueOnce(new Error('timeout'));
    await expect(service.cancel(booking.id)).rejects.toThrow('human review');
    expect((await repository.getBooking(booking.id))?.status).toBe('confirmed');
    await expect(service.create(input)).rejects.toThrow(BookingConflictError);
    const claims = await Promise.allSettled([repository.claimOperation(booking.id), repository.claimOperation(booking.id)]);
    expect(claims.filter((claim) => claim.status === 'fulfilled')).toHaveLength(1);
    const claim = claims.find((value) => value.status === 'fulfilled')!;
    if (claim.status === 'fulfilled') await repository.failOperation(booking.id, claim.value.operation.leaseId);
    expect((await service.retry(booking.id)).status).toBe('cancelled');
    expect((await service.cancel(booking.id)).status).toBe('cancelled');
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

  it('clears deleted business chat context and pending action', async () => {
    const { repository } = await setup();
    const now = new Date().toISOString();
    const chatId = 'deleted-history-test';
    await repository.saveConversation({ telegramChatId: chatId, clientId: 'test', businessConnectionId: 'connection-1', openaiConversationId: 'conv-old', assistantEnabled: true, state: 'active', summary: '', pendingAction: { name: 'cancel_booking', arguments: { bookingId: 'test-booking' }, expiresAt: now }, createdAt: now, updatedAt: now });
    await repository.appendMessage(chatId, 'user', 'Deleted client text');
    await repository.appendMessage(chatId, 'assistant', 'Old assistant text');

    expect(await repository.resetDeletedBusinessChat(chatId, 'other-connection')).toBe(false);
    expect(await repository.listMessages(chatId)).toHaveLength(2);
    expect(await repository.resetDeletedBusinessChat(chatId, 'connection-1')).toBe(true);
    expect(await repository.listMessages(chatId)).toEqual([]);
    expect(await repository.getConversation(chatId)).toMatchObject({ assistantEnabled: true });
    expect((await repository.getConversation(chatId))?.pendingAction).toBeUndefined();
    expect((await repository.getConversation(chatId))?.openaiConversationId).toBeUndefined();
  });

});
