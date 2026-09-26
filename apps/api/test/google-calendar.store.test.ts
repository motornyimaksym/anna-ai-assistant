import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleCalendarStore, openCalendar, sealCalendar, type CalendarConnection } from '../src/google-calendar.store.js';
const { getFirestore } = vi.hoisted(() => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore }));
function fixture() {
  let record: CalendarConnection | undefined;
  const ref = { get: async () => ({ data: () => record ? structuredClone(record) : undefined }) };
  let queue = Promise.resolve();
  getFirestore.mockReturnValue({ collection: () => ({ doc: () => ref }), runTransaction: (work: (tx: { get: () => ReturnType<typeof ref.get>; set: (_ref: unknown, value: CalendarConnection) => void }) => Promise<unknown>) => {
    const next = queue.then(() => work({ get: ref.get, set: (_, value) => { record = structuredClone(value); } }));
    queue = next.then(() => {}, () => {}); return next;
  } });
  return { store: new GoogleCalendarStore({} as never), get: () => record };
}
beforeEach(() => { vi.stubEnv('GOOGLE_CALENDAR_ENCRYPTION_KEY', Buffer.alloc(32, 3).toString('base64')); });
afterEach(() => vi.unstubAllEnvs());
describe('Calendar encrypted lifecycle', () => {
  it('encrypts tokens and rejects wrong purpose, tampering and key changes', () => {
    const envelope = sealCalendar('refresh-token-secret', 'token');
    expect(JSON.stringify(envelope)).not.toContain('refresh-token-secret');
    expect(openCalendar(envelope, 'token')).toBe('refresh-token-secret');
    expect(() => openCalendar(envelope, 'proof')).toThrow();
    expect(() => openCalendar({ ...envelope, tag: Buffer.alloc(16).toString('base64') }, 'token')).toThrow();
    vi.stubEnv('GOOGLE_CALENDAR_ENCRYPTION_KEY', Buffer.alloc(32, 4).toString('base64'));
    expect(() => openCalendar(envelope, 'token')).toThrow();
  });
  it('binds pending state to the initiating owner and consumes it once', async () => {
    const { store, get } = fixture();
    await store.begin('owner', 'random-state', sealCalendar('proof', 'proof'));
    expect(JSON.stringify(get())).not.toContain('random-state');
    await expect(store.consume('stakeholder', 'random-state')).rejects.toThrow();
    await expect(store.consume('owner', 'wrong')).rejects.toThrow();
    const results = await Promise.allSettled([store.consume('owner', 'random-state'), store.consume('owner', 'random-state')]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
  });
  it('rejects expired state and stale completion after cancel/restart', async () => {
    const { store, get } = fixture();
    await store.begin('owner', 'state', sealCalendar('proof', 'proof'));
    get()!.expiresAt = Date.now() - 1;
    await expect(store.consume('owner', 'state')).rejects.toThrow();
    await store.begin('owner', 'new', sealCalendar('proof', 'proof'));
    const consumed = await store.consume('owner', 'new');
    await store.replace(consumed.revision, { phase: 'disconnected' });
    await expect(store.replace(consumed.revision, { phase: 'connected' })).rejects.toThrow();
  });
});
