import { describe, expect, it, vi } from 'vitest';
import { TelegramScheduleImportStore } from '../src/telegram-schedule-import.store.js';
import type { FirebaseAdminService } from '../src/firebase-admin.js';

const { getFirestore } = vi.hoisted(() => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore }));

const fixture = () => {
  let value: Record<string, unknown> | undefined;
  const ref = {
    get: async () => ({ data: () => value }),
    set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => { value = options?.merge ? { ...value, ...data } : data; },
  };
  const firestore = {
    collection: vi.fn(() => ({ doc: vi.fn(() => ref) })),
    runTransaction: vi.fn(async (callback: (tx: { get: (ref: unknown) => Promise<{ data: () => Record<string, unknown> | undefined }>; set: (ref: unknown, data: Record<string, unknown>, options?: { merge?: boolean }) => void }) => Promise<unknown>) => callback({
      get: async () => ({ data: () => value }),
      set: (_ref, data, options) => { value = options?.merge ? { ...value, ...data } : data; },
    })),
  };
  getFirestore.mockReturnValue(firestore);
  return { store: new TelegramScheduleImportStore({} as FirebaseAdminService), get: () => value, set: (next: Record<string, unknown>) => { value = next; } };
};

describe('Telegram schedule import storage', () => {
  it('claims sync at most once per five minutes across transactions', async () => {
    const { store, get } = fixture();
    expect(await store.claimSync(1_000)).toEqual({ allowed: true, sourcePeerId: undefined });
    expect(get()?.nextAttemptAt).toBe(301_000);
    expect(await store.claimSync(300_999)).toEqual({ allowed: false, sourcePeerId: undefined });
    expect(await store.claimSync(301_000)).toEqual({ allowed: true, sourcePeerId: undefined });
  });

  it('preserves the resolved peer ID and exposes only a parsed read snapshot', async () => {
    const { store, get } = fixture();
    await store.claimSync(1_000);
    await store.saveSnapshot({
      sourcePeerId: '42', sourceChatTitle: 'Календар та планування часу', syncedAt: '2026-09-25T10:00:00.000Z',
      slots: [{ messageId: '17', text: 'Сьогодні 15:00', createdAt: '2026-09-25T09:30:00.000Z' }],
    });
    expect(get()).toMatchObject({ sourcePeerId: '42', nextAttemptAt: 301_000 });
    expect(await store.readSnapshot()).toEqual({
      sourceChatTitle: 'Календар та планування часу', syncedAt: '2026-09-25T10:00:00.000Z',
      slots: [{ messageId: '17', text: 'Сьогодні 15:00', createdAt: '2026-09-25T09:30:00.000Z' }],
    });
  });
});
