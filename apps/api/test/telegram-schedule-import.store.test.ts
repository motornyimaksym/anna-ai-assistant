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
    expect(await store.claimSync(1_000)).toMatchObject({ allowed: true, sourcePeerId: undefined, attemptId: expect.any(String) });
    expect(get()?.nextAttemptAt).toBe(301_000);
    expect(await store.claimSync(300_999)).toEqual({ allowed: false, sourcePeerId: undefined });
    expect(await store.claimSync(301_000)).toMatchObject({ allowed: true, sourcePeerId: undefined, attemptId: expect.any(String) });
  });

  it('preserves the resolved peer ID and exposes only a parsed read snapshot', async () => {
    const { store, get } = fixture();
    const claim = await store.claimSync(1_000);
    await store.complete(claim.attemptId!, 'success', {
      sourcePeerId: '42', sourceChatTitle: 'Календар та планування часу', syncedAt: '2026-09-25T10:00:00.000Z',
      slots: [{ messageId: '17', text: 'Сьогодні 15:00', createdAt: '2026-09-25T09:30:00.000Z' }],
    });
    expect(get()).toMatchObject({ sourcePeerId: '42', nextAttemptAt: 301_000 });
    expect(await store.readSnapshot()).toMatchObject({
      sourceChatTitle: 'Календар та планування часу', syncedAt: '2026-09-25T10:00:00.000Z',
      slots: [{ messageId: '17', text: 'Сьогодні 15:00', createdAt: '2026-09-25T09:30:00.000Z' }],
    });
  });
});


it('invalidates in-flight results when the owner changes source and preserves cooldown', async () => {
  const { store, get } = fixture();
  const claim = await store.claimSync(1000);
  await store.selectSource('99', 'Selected private chat');
  await store.complete(claim.attemptId!, 'success', { sourcePeerId: '42', sourceChatTitle: 'Old', slots: [], syncedAt: new Date().toISOString() });
  expect(get()).toMatchObject({ sourcePeerId: '99', status: 'idle', nextAttemptAt: 301000, slots: [] });
  expect(get()).not.toHaveProperty('syncedAt');
  expect((await store.claimSync(1001)).allowed).toBe(false);
});

it('exposes stale attempts as timed out without exposing claim IDs', async () => {
  const { store } = fixture();
  await store.claimSync(Date.now() - 61000);
  const result = await store.readSnapshot();
  expect(result.status).toBe('timeout');
  expect(result).not.toHaveProperty('attemptId');
});

it('binds topics, invalidates same-group stale results, and removes topics for whole-chat sources', async () => {
  const { store, get } = fixture();
  await store.selectSource('-10042', 'Forum', { id: 42, title: 'Old topic' });
  const claim = await store.claimSync(1000);
  expect(claim.sourceTopicId).toBe(42);
  await store.selectSource('-10042', 'Forum', { id: 99, title: 'New topic' });
  await store.complete(claim.attemptId!, 'success', { sourcePeerId: '-10042', sourceChatTitle: 'Forum', sourceTopicId: 42, sourceTopicTitle: 'Old topic', slots: [], syncedAt: new Date().toISOString() });
  expect(await store.readSnapshot()).toMatchObject({ sourceTopicId: 99, sourceTopicTitle: 'New topic', status: 'idle' });
  expect(get()?.nextAttemptAt).toBe(301000);
  await store.selectSource('-10042', 'Forum');
  expect(get()).not.toHaveProperty('sourceTopicId');
  expect(get()).not.toHaveProperty('sourceTopicTitle');
});

it('allows manual refresh after failure during cooldown, while serializing runs and retaining cooldown after success', async () => {
  const { store, get, set } = fixture();
  set({ status: 'connection_failed', nextAttemptAt: 301_000, sourcePeerId: '42' });
  const claim = await store.claimManualSync(2_000);
  expect(claim).toMatchObject({ allowed: true, sourcePeerId: '42', runId: expect.any(String), attemptId: expect.any(String) });
  expect(get()).toMatchObject({ status: 'syncing', manualRetryRunId: claim.runId, manualRetryUntil: 302_000, nextAttemptAt: 302_000 });
  await expect(store.claimManualSync(2_001)).resolves.toMatchObject({ allowed: false });
  await store.complete(claim.attemptId!, 'account_busy');
  const retry = await store.claimManualRetry(claim.runId!, 12_000);
  expect(retry).toMatchObject({ allowed: true, attemptId: expect.any(String), sourcePeerId: '42' });
  await store.complete(retry.attemptId!, 'success', { sourcePeerId: '42', sourceChatTitle: 'Calendar', slots: [], syncedAt: new Date(12_000).toISOString() });
  await store.finishManualRetryRun(claim.runId!, 13_000);
  expect(get()).toMatchObject({ status: 'success', nextAttemptAt: 312_000, manualRetryRunId: '', manualRetryUntil: 13_000 });
  expect((await store.claimManualSync(13_001)).allowed).toBe(false);
});

it('keeps successful refreshes on cooldown and rejects retry claims after a run ends or source changes', async () => {
  const { store, set } = fixture();
  set({ status: 'success', nextAttemptAt: 300_000, sourcePeerId: '42' });
  expect((await store.claimManualSync(1_000)).allowed).toBe(false);
  set({ status: 'timeout', nextAttemptAt: 300_000, sourcePeerId: '42' });
  const claim = await store.claimManualSync(1_000);
  await store.selectSource('99', 'New source');
  expect((await store.claimManualRetry(claim.runId!, 2_000)).allowed).toBe(false);
});
