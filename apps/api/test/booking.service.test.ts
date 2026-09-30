import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FirebaseAdminService } from '../src/firebase-admin.js';
import { BookingRepository } from '../src/repository.js';

const withEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
afterEach(() => vi.unstubAllEnvs());
describe.skipIf(!withEmulator)('Firestore conversation and settings', () => {
  beforeAll(async () => {
    if (!getApps().length) initializeApp({ projectId: 'demo-ai-massage' });
    const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ai-massage/databases/(default)/documents`, { method: 'DELETE' });
    expect(response.ok).toBe(true);
  });

  const setup = async () => ({ repository: new BookingRepository(new FirebaseAdminService()) });

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
    const saved = await repository.saveBotSettingsOverride({ maxReadDelayMs: 900, typingDelayPerSymbolMs: 350, testerUsernames: ['User61785', '@AnotherUser'] });
    expect(saved).toMatchObject({ maxReadDelayMs: 900, typingDelayPerSymbolMs: 350, testerUsernames: ['user61785', 'anotheruser'], updatedAt: expect.any(String) });
    expect(await repository.getBotSettingsOverride()).toEqual(saved);
  });
  it('uses the legacy tester fallback for old behavior documents until a list is saved', async () => {
    vi.stubEnv('TELEGRAM_ALLOWED_USERNAME', 'user61785');
    const repository = new BookingRepository(new FirebaseAdminService());
    await getFirestore().collection('assistantSettings').doc('behavior').set({ maxReadDelayMs: 900, typingDelayPerSymbolMs: 350, updatedAt: new Date().toISOString() });
    expect(await repository.getBotSettingsOverride()).toMatchObject({ testerUsernames: ['user61785'] });
    await repository.saveBotSettingsOverride({ maxReadDelayMs: 900, typingDelayPerSymbolMs: 350, testerUsernames: [] });
    expect(await repository.getBotSettingsOverride()).toMatchObject({ testerUsernames: [] });
  });
  it('persists a normalized stakeholder email allowlist', async () => {
    const repository = new BookingRepository(new FirebaseAdminService());
    expect(await repository.getAdminAccessOverride()).toBeUndefined();
    const saved = await repository.saveAdminAccessOverride(['Stakeholder@Example.com']);
    expect(saved).toMatchObject({ emails: ['stakeholder@example.com'], updatedAt: expect.any(String) });
    expect((await getFirestore().collection('assistantSettings').doc('adminAccess').get()).data()?.emails).toEqual(['stakeholder@example.com']);
    expect(await repository.getAdminAccessOverride()).toEqual(saved);
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

  it('keeps booking proposal binding out of ordinary message history', async () => {
    const { repository } = await setup();
    const proposalId = '2a1c75d0-d891-4e04-8b54-341cba762ae6';
    await repository.appendMessage('proposal-history-test', 'assistant', 'Massage proposal', proposalId);

    expect(await repository.listMessages('proposal-history-test')).toEqual([{ role: 'assistant', content: 'Massage proposal' }]);
    expect(await repository.listMessagesForBookingCheck('proposal-history-test')).toEqual([{ role: 'assistant', content: 'Massage proposal', bookingProposalId: proposalId }]);
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

  it('lets an admin clear one conversation without releasing its human case', async () => {
    const { repository } = await setup();
    const now = new Date().toISOString();
    const chatId = 'manual-clear-test';
    await repository.saveConversation({ telegramChatId: chatId, clientId: 'test', openaiConversationId: 'conv-old', assistantEnabled: false, state: 'active', summary: 'Old context', activeHumanRequestId: 'case-1', pendingAction: { name: 'cancel_booking', arguments: { bookingId: 'test-booking' }, expiresAt: now }, createdAt: now, updatedAt: now });
    await repository.appendMessage(chatId, 'user', 'Old question');
    await repository.appendMessage(chatId, 'assistant', 'Old reply');

    expect(await repository.clearConversationContext(chatId)).toEqual({ clearedMessages: 2 });
    expect(await repository.listMessages(chatId)).toEqual([]);
    expect(await repository.getConversation(chatId)).toMatchObject({ assistantEnabled: false, activeHumanRequestId: 'case-1', summary: '' });
    expect((await repository.getConversation(chatId))?.pendingAction).toBeUndefined();
    expect((await repository.getConversation(chatId))?.openaiConversationId).toBeUndefined();
    expect(await repository.clearConversationContext('unknown-chat')).toBeUndefined();
  });

});
