import { describe, expect, it, vi } from 'vitest';
import { TelegramAccountStore } from '../src/telegram-account.store.js';
import type { FirebaseAdminService } from '../src/firebase-admin.js';
const { getFirestore } = vi.hoisted(() => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore }));
const fixture = () => {
  let value: Record<string, unknown> | undefined;
  const ref = { get: async () => ({ data: () => value }) };
  const firestore = {
    collection: vi.fn(() => ({ doc: vi.fn(() => ref) })),
    runTransaction: vi.fn(async (callback: (tx: { get: (ref: unknown) => Promise<{ data: () => Record<string, unknown> | undefined }>; set: (ref: unknown, data: Record<string, unknown>) => void }) => Promise<unknown>) => callback({
      get: async () => ({ data: () => value }),
      set: (_ref, data) => { value = data; },
    })),
  };
  getFirestore.mockReturnValue(firestore);
  return { store: new TelegramAccountStore({} as FirebaseAdminService), get: () => value, set: (next: Record<string, unknown>) => { value = next; } };
};
describe('Telegram account lease', () => {
  it('serializes requests and rejects stale completion', async () => {
    const { store, get, set } = fixture();
    const first = await store.acquire();
    await expect(store.acquire()).rejects.toThrow('Another Telegram request');
    set({ ...get(), leaseUntil: Date.now() - 1 });
    const second = await store.acquire();
    await expect(store.finish(first.id, { phase: 'connected' })).rejects.toThrow('expired');
    await store.finish(second.id, { phase: 'code', ownerUid: 'owner' });
    expect(get()).toEqual({ phase: 'code', ownerUid: 'owner' });
  });
});
