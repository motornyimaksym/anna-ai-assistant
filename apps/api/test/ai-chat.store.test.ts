import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatStore } from '../src/ai-chat.store.js';
const { getFirestore } = vi.hoisted(() => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore }));
type Ref = { path: string; collection(name: string): Ref; doc(id: string): Ref; get(): Promise<{ data(): Record<string, unknown> | undefined }>; create(value: Record<string, unknown>): Promise<void> };
function fixture() {
  const data = new Map<string, Record<string, unknown>>();
  const ref = (path: string): Ref => ({
    path, collection: (name: string) => ref(`${path}/${name}`), doc: (id: string) => ref(`${path}/${id}`),
    get: async () => ({ data: () => structuredClone(data.get(path)) }),
    create: async (value: Record<string, unknown>) => { data.set(path, structuredClone(value)); },
  });
  let queue = Promise.resolve();
  getFirestore.mockReturnValue({ collection: (name: string) => ref(name), runTransaction: (callback: (tx: unknown) => Promise<unknown>) => {
    const result = queue.then(() => callback({ get: (target: Ref) => target.get(), set: (target: Ref, value: Record<string, unknown>) => data.set(target.path, structuredClone(value)) }));
    queue = result.then(() => {}, () => {}); return result;
  } });
  return { store: new AiChatStore({} as never), data };
}
beforeEach(() => vi.clearAllMocks());
describe('private thread persistence', () => {
  it('scopes reads and writes to the authenticated UID', async () => {
    const { store } = fixture(); const thread = await store.create('owner');
    await expect(store.read('stakeholder', thread.id)).rejects.toThrow('Chat not found');
    await expect(store.acquire('stakeholder', thread.id)).rejects.toThrow('Chat not found');
    expect((await store.read('owner', thread.id)).id).toBe(thread.id);
  });
  it('allows only one concurrent turn and refuses stale lease writes', async () => {
    const { store } = fixture(); const thread = await store.create('owner');
    const result = await Promise.allSettled([store.acquire('owner', thread.id), store.acquire('owner', thread.id)]);
    expect(result.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    if (result[0]!.status !== 'fulfilled') throw new Error('Expected lease');
    const lease = result[0]!.value; await store.save('owner', lease);
    await store.acquire('owner', thread.id);
    await expect(store.save('owner', lease)).rejects.toThrow('Chat request expired');
  });
  it('bounds retained history and does not expose leases', async () => {
    const { store } = fixture(); const thread = await store.create('owner'); const lease = await store.acquire('owner', thread.id);
    lease.messages = Array.from({ length: 45 }, () => ({ role: 'user' as const, text: 'Hi', createdAt: new Date().toISOString() }));
    await store.save('owner', lease);
    const loaded = await store.read('owner', thread.id); expect(loaded.messages).toHaveLength(40); expect(loaded).not.toHaveProperty('leaseId');
  });
});
