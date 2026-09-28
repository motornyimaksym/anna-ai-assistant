import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { BookingRepository } from '../src/repository.js';
const storage = vi.hoisted(() => ({ getFirestore: vi.fn(), getStorage: vi.fn(), blobs: new Map<string, Uint8Array>() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: storage.getFirestore }));
vi.mock('firebase-admin/storage', () => ({ getStorage: storage.getStorage }));

function setup(records: Map<string, unknown>) {
  const snapshot = (ref: { id: string }) => ({ data: () => records.get(ref.id), exists: records.has(ref.id) });
  const ref = (id: string) => ({ id, get: async () => snapshot({ id }) });
  let queue = Promise.resolve();
  const tx = {
    get: async (value: { id: string }) => snapshot(value),
    getAll: async (...refs: { id: string }[]) => refs.map(snapshot),
    set: (value: { id: string }, data: unknown) => records.set(value.id, data),
    delete: (value: { id: string }) => records.delete(value.id),
  };
  storage.getFirestore.mockReturnValue({ collection: () => ({ doc: (id: string) => ref(id) }), runTransaction: (work: (value: typeof tx) => Promise<unknown>) => { const result = queue.then(() => work(tx)); queue = result.then(() => {}); return result; } });
  storage.blobs.clear();
  storage.getStorage.mockReturnValue({ bucket: () => ({ file: (path: string) => ({
    save: async (value: Uint8Array) => { storage.blobs.set(path, Uint8Array.from(value)); },
    download: async () => { const value = storage.blobs.get(path); if (!value) throw new Error('missing object'); return [Buffer.from(value)]; },
    delete: async () => { storage.blobs.delete(path); },
  }) }) });
  return new BookingRepository({} as never);
}

const event = () => ({ id: randomUUID(), createdAt: new Date().toISOString(), traceId: randomUUID(), chatRef: 'anonymous', stage: 'received' as const, level: 'info' as const, details: {} });

it('migrates legacy records and physically retains only 200 after concurrent appends', async () => {
  const old = Array.from({ length: 200 }, event);
  const records = new Map<string, unknown>([['recent', { events: old }]]);
  const repository = setup(records);
  storage.blobs.set(`assistant-diagnostics/${old[0]!.id}/request.json`, Buffer.from('old body'));
  const fresh = Array.from({ length: 5 }, event);
  await Promise.all(fresh.map((item) => repository.appendDebugEvent(item)));
  expect(records.size).toBe(201); // 200 event documents plus the small index.
  expect(records.get('recent')).not.toHaveProperty('events');
  expect((records.get('recent') as { ids: string[] }).ids).toHaveLength(200);
  expect(records.has(old[0]!.id)).toBe(false);
  expect(records.has(old[4]!.id)).toBe(false);
  expect(storage.blobs.has(`assistant-diagnostics/${old[0]!.id}/request.json`)).toBe(false);
  expect(await repository.listDebugEvents()).toHaveLength(200);
  for (const item of fresh) expect(records.has(item.id)).toBe(true);
});

it('stores and returns complete large payloads outside bounded Firestore metadata', async () => {
  const records = new Map<string, unknown>();
  const repository = setup(records);
  const item = { id: randomUUID(), createdAt: new Date().toISOString(), traceId: randomUUID(), chatRef: 'anonymous', stage: 'provider_request' as const, level: 'info' as const, details: { request: {
    provider: 'openai' as const, operation: 's1_routing', endpoint: 'https://api.openai.com/v1/responses', method: 'POST' as const, conversationAttached: false, attempts: 1, durationMs: 10, outputTypes: [], requestBytes: 50_000, responseBytes: 40_000,
  } } };
  const requestBody = JSON.stringify({ input: '💆'.repeat(20_000) });
  const responseBody = JSON.stringify({ output: 'ї'.repeat(20_000) });
  await repository.appendDebugEvent(item, { requestBody, responseBody });
  expect((records.get(item.id) as typeof item).details.request).toHaveProperty('bodyStorageStatus', 'complete');
  expect(JSON.stringify(records.get(item.id))).not.toContain('💆');
  const payload = await repository.getDebugPayload(item.id);
  expect(payload).toEqual({ status: 'complete', requestBody, responseBody });
  expect(Buffer.byteLength(payload.requestBody!)).toBeGreaterThan(16_384);
  expect(Buffer.byteLength(payload.responseBody!)).toBeGreaterThan(8_192);
});
