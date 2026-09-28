import { describe, expect, it, vi } from 'vitest';
import type { ConversationDto } from '@booking/contracts';
import { BookingRepository } from '../src/repository.js';
import type { FirebaseAdminService } from '../src/firebase-admin.js';
const { getFirestore, deleted } = vi.hoisted(() => ({ getFirestore: vi.fn(), deleted: Symbol('deleted') }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore, FieldValue: { delete: () => deleted } }));
const pending = { id: '2a1c75d0-d891-4e04-8b54-341cba762ae6', name: 'cancel_booking' as const, arguments: { bookingId: 'booking' }, expiresAt: '2099-01-01T00:00:00.000Z', confirmationText: 'Cancel booking tomorrow?' };
const initial: ConversationDto = { telegramChatId: 'chat', clientId: 'client', assistantEnabled: true, state: 'active', summary: '', pendingAction: pending, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const setup = (start = initial) => {
  let value: Record<string, unknown> = structuredClone(start);
  let queue: Promise<unknown> = Promise.resolve();
  const ref = {};
  const db = {
    collection: () => ({ doc: () => ref }),
    runTransaction: (callback: (tx: unknown) => Promise<unknown>) => {
      const run = queue.then(() => callback({
        get: async () => ({ exists: true, data: () => structuredClone(value) }),
        update: (_ref: unknown, patch: Record<string, unknown>) => { for (const [key, item] of Object.entries(patch)) { if (item === deleted) delete value[key]; else value[key] = item; } },
        set: (_ref: unknown, data: Record<string, unknown>) => { value = data; },
      }));
      queue = run.catch(() => {});
      return run;
    },
  };
  getFirestore.mockReturnValue(db);
  return { repository: new BookingRepository({} as FirebaseAdminService), read: () => value };
};
it('updates activity without copying stale workflow or automation state', async () => {
  const { repository, read } = setup({ ...initial, pendingAction: undefined, assistantEnabled: false });
  await repository.touchConversation(initial);
  expect(read().pendingAction).toBeUndefined();
  expect(read().assistantEnabled).toBe(false);
});

describe('poisoned provider conversation replacement', () => {
  it('replaces only the rejected ID and preserves proposals', async () => {
    const { repository, read } = setup({ ...initial, openaiConversationId: 'old' });
    await repository.replaceOpenAiConversation('chat', 'client', 'old', 'new');
    expect(read().openaiConversationId).toBe('new');
    expect(read().pendingAction).toEqual(pending);
    await expect(repository.replaceOpenAiConversation('chat', 'client', 'old', 'other')).rejects.toThrow();
    expect(read().openaiConversationId).toBe('new');
  });
  it.each([{ clientId: 'other' }, { assistantEnabled: false }, { activeHumanRequestId: 'human' }, { humanTakeoverUntil: '2099-01-01T00:00:00.000Z' }])('rejects identity/pause changes %j', async (patch) => {
    const { repository, read } = setup({ ...initial, openaiConversationId: 'old', ...patch });
    await expect(repository.replaceOpenAiConversation('chat', 'client', 'old', 'new')).rejects.toThrow();
    expect(read().openaiConversationId).toBe('old');
  });
});
