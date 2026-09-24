import { beforeAll, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
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
