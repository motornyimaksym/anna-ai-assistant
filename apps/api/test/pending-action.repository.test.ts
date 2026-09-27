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
describe('pending proposal compare and consume', () => {
  it('allows only one consumption and preserves unrelated fields', async () => {
    const { repository, read } = setup();
    const results = await Promise.all([1, 2].map(() => repository.replacePendingAction('chat', 'client', pending, undefined, { requireUnexpired: true })));
    expect(results.sort()).toEqual([false, true]);
    expect(read().pendingAction).toBeUndefined();
    expect(read().assistantEnabled).toBe(true);
  });
  it('rejects a replaced proposal and does not discard it', async () => {
    const { repository, read } = setup({ ...initial, pendingAction: { ...pending, id: 'bea51662-f7c6-4836-a2a3-0e3ec22341d1' } });
    expect(await repository.replacePendingAction('chat', 'client', pending, undefined)).toBe(false);
    expect(read().pendingAction).toBeDefined();
  });
  it.each([
    { clientId: 'other' }, { assistantEnabled: false }, { activeHumanRequestId: 'human' },
    { humanTakeoverUntil: '2099-01-01T00:00:00.000Z' },
  ])('refuses execution after identity/pause change %j', async (patch) => {
    const { repository, read } = setup({ ...initial, ...patch });
    expect(await repository.replacePendingAction('chat', 'client', pending, undefined, { requireUnexpired: true })).toBe(false);
    expect(read().pendingAction).toBeDefined();
  });
  it('rechecks expiry inside the transaction, while allowing expired proposal discard', async () => {
    const expired = { ...pending, expiresAt: '2000-01-01T00:00:00.000Z' };
    const { repository } = setup({ ...initial, pendingAction: expired });
    expect(await repository.replacePendingAction('chat', 'client', expired, undefined, { requireUnexpired: true })).toBe(false);
    expect(await repository.replacePendingAction('chat', 'client', expired, undefined)).toBe(true);
  });
  it('does not resurrect consumed proposals through stale Telegram activity', async () => {
    const { repository, read } = setup();
    await repository.replacePendingAction('chat', 'client', pending, undefined, { requireUnexpired: true });
    await repository.touchConversation(initial);
    expect(read().pendingAction).toBeUndefined();
  });
});
