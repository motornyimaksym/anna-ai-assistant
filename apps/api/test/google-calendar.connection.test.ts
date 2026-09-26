import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleCalendarConnection } from '../src/google-calendar.connection.js';
import { openCalendar, sealCalendar, type CalendarConnection } from '../src/google-calendar.store.js';
const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('google-auth-library', () => ({ OAuth2Client: class { verifyIdToken = verify; } }));
const scopes = ['calendar.events', 'calendar.freebusy', 'calendar.calendarlist.readonly'].map((s) => `https://www.googleapis.com/auth/${s}`).join(' ');
function fixture(initial?: CalendarConnection) {
  let record = initial;
  const store = {
    read: vi.fn(async () => record),
    begin: vi.fn(async (_uid: string, _state: string, proof: ReturnType<typeof sealCalendar>) => { record = { revision: 'r1', phase: 'pending', pending: { ownerUid: 'owner', stateHash: 'hash', encryptedProof: proof } }; }),
    consume: vi.fn(async () => ({ revision: 'r1', proof: record!.pending!.encryptedProof })),
    replace: vi.fn(async (_revision: string | undefined, next: Omit<CalendarConnection, 'revision'>) => { record = { ...next, revision: 'r2' }; }),
  };
  const fetch = vi.fn<typeof globalThis.fetch>(); vi.stubGlobal('fetch', fetch);
  return { service: new GoogleCalendarConnection(store as never), store, fetch, get: () => record };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client'); vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret');
  vi.stubEnv('GOOGLE_CALENDAR_REDIRECT_URI', 'https://app.example/google-calendar/callback');
  vi.stubEnv('GOOGLE_CALENDAR_ENCRYPTION_KEY', Buffer.alloc(32, 3).toString('base64'));
  vi.stubEnv('GOOGLE_CALENDAR_ACCOUNT_EMAIL', 'anna.lush.massage@gmail.com');
  vi.stubEnv('GOOGLE_REFRESH_TOKEN', ''); vi.stubEnv('GOOGLE_CALENDAR_ID', '');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function authorized() {
  const f = fixture(); const { url } = await f.service.start('owner'); const params = new URL(url).searchParams;
  verify.mockResolvedValue({ getPayload: () => ({ email: 'anna.lush.massage@gmail.com', email_verified: true, nonce: params.get('nonce') }) });
  f.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ refresh_token: 'refresh-secret', id_token: 'id-token', scope: scopes })));
  return { ...f, params };
}
describe('owner Calendar OAuth', () => {
  it('requests offline access, random state, nonce and PKCE with a fixed callback', async () => {
    const f = await authorized();
    expect(f.params.get('access_type')).toBe('offline'); expect(f.params.get('code_challenge_method')).toBe('S256');
    expect(f.params.get('state')).toHaveLength(43); expect(f.params.get('redirect_uri')).toBe('https://app.example/google-calendar/callback');
    const result = await f.service.complete('owner', { state: f.params.get('state')!, code: 'code' });
    expect(result).toMatchObject({ phase: 'connected', email: 'anna.lush.massage@gmail.com' });
    expect(JSON.stringify(result)).not.toContain('refresh-secret');
    expect(openCalendar(f.get()!.encryptedToken!, 'token')).toBe('refresh-secret');
    expect(f.store.consume).toHaveBeenCalledWith('owner', f.params.get('state'));
    const body = f.fetch.mock.calls[0]![1]!.body as URLSearchParams;
    expect(body.get('code_verifier')).toHaveLength(43);
    expect(verify).toHaveBeenCalledWith({ idToken: 'id-token', audience: 'client' });
  });
  it('rejects wrong nonce, account, unverified identity and missing grants', async () => {
    for (const identity of [{ email: 'other@example.com', email_verified: true }, { email: 'anna.lush.massage@gmail.com', email_verified: false }, { email: 'anna.lush.massage@gmail.com', email_verified: true, nonce: 'wrong' }]) {
      const f = await authorized(); verify.mockResolvedValue({ getPayload: () => identity });
      await expect(f.service.complete('owner', { state: f.params.get('state')!, code: 'code' })).rejects.toThrow();
      expect(f.get()!.phase).toBe('disconnected');
    }
    const f = await authorized(); f.fetch.mockReset().mockResolvedValueOnce(new Response(JSON.stringify({ refresh_token: 'token', id_token: 'id', scope: 'openid email' })));
    await expect(f.service.complete('owner', { state: f.params.get('state')!, code: 'code' })).rejects.toThrow('permissions');
  });
  it('handles consent denial without exchanging tokens', async () => {
    const f = fixture(); const { url } = await f.service.start('owner');
    expect((await f.service.complete('owner', { state: new URL(url).searchParams.get('state')!, denied: true })).phase).toBe('disconnected');
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it('uses legacy only before a managed document exists', async () => {
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'legacy'); vi.stubEnv('GOOGLE_CALENDAR_ID', 'primary');
    expect(await fixture().service.credentials()).toEqual({ refreshToken: 'legacy', calendarId: 'primary' });
    expect(await fixture({ revision: 'r', phase: 'disconnected' }).service.credentials()).toBeUndefined();
  });
  it('preserves tokens on failed revocation and disables legacy on success', async () => {
    const f = fixture({ revision: 'r', phase: 'connected', encryptedToken: sealCalendar('refresh', 'token') });
    f.fetch.mockRejectedValueOnce(new Error('provider secret'));
    await expect(f.service.disconnect()).rejects.toThrow('retained'); expect(f.store.replace).not.toHaveBeenCalled();
    f.fetch.mockResolvedValueOnce(new Response(''));
    expect((await f.service.disconnect()).phase).toBe('disconnected'); expect(f.get()).not.toHaveProperty('encryptedToken');
  });
  it('validates selected calendar access and returns no credentials', async () => {
    const f = fixture({ revision: 'r', phase: 'connected', encryptedToken: sealCalendar('refresh', 'token') });
    f.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access' }))).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'calendar', summary: 'Anna', accessRole: 'reader' })));
    await expect(f.service.select('calendar')).rejects.toThrow('permission');
    expect(f.store.replace).not.toHaveBeenCalled();
    f.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access' }))).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'calendar', summary: 'Anna', accessRole: 'owner' })));
    expect(await f.service.select('calendar')).toMatchObject({ calendarId: 'calendar', calendarTitle: 'Anna' });
  });
});
