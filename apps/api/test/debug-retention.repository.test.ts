import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { BookingRepository } from '../src/repository.js';
const { getFirestore } = vi.hoisted(() => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore }));
const event = () => ({ id: randomUUID(), createdAt: new Date().toISOString(), traceId: randomUUID(), chatRef: 'anonymous', stage: 'received' as const, level: 'info' as const, details: {} });
it('migrates legacy records and physically retains only 200 after concurrent appends', async () => {
  const old = Array.from({ length: 200 }, event);
  const records = new Map<string, { events?: ReturnType<typeof event>[]; ids?: string[] }>([['recent', { events: old }]]);
  const snapshot = (ref: { id: string }) => ({ data: () => records.get(ref.id), exists: records.has(ref.id) });
  let queue = Promise.resolve();
  const tx = { get: async (ref: { id: string }) => snapshot(ref), getAll: async (...refs: { id: string }[]) => refs.map(snapshot), set: (ref: { id: string }, value: { events?: ReturnType<typeof event>[]; ids?: string[] }) => records.set(ref.id, value), delete: (ref: { id: string }) => records.delete(ref.id) };
  getFirestore.mockReturnValue({ collection: () => ({ doc: (id: string) => ({ id, get: async () => snapshot({ id }) }) }), runTransaction: (work: (value: typeof tx) => Promise<unknown>) => { const result = queue.then(() => work(tx)); queue = result.then(() => {}); return result; } });
  const repository = new BookingRepository({} as never);
  expect(await repository.listDebugEvents()).toHaveLength(200);
  const fresh = Array.from({ length: 5 }, event);
  await Promise.all(fresh.map((item) => repository.appendDebugEvent(item)));
  expect(records.size).toBe(201); // 200 event documents plus the small index.
  expect(records.get('recent')).not.toHaveProperty('events');
  expect(records.get('recent').ids).toHaveLength(200);
  expect(records.has(old[0]!.id)).toBe(false);
  expect(records.has(old[4]!.id)).toBe(false);
  expect(await repository.listDebugEvents()).toHaveLength(200);
  for (const item of fresh) expect(records.has(item.id)).toBe(true);
});
