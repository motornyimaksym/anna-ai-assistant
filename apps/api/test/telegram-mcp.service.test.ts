import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramMcpService } from '../src/telegram-mcp.service.js';
import { encryptSession } from '../src/telegram-account.store.js';
const { getIdTokenClient } = vi.hoisted(() => ({ getIdTokenClient: vi.fn() }));
vi.mock('google-auth-library', () => ({ GoogleAuth: class { getIdTokenClient = getIdTokenClient; } }));
function fixture() {
  const accounts = {
    acquire: vi.fn(async () => ({ id: 'lease', record: { phase: 'connected', encrypted: encryptSession({ session: 'private-session' }, Buffer.alloc(32, 1)) } })),
    finish: vi.fn(async () => {}),
  };
  const fetch = vi.fn(async () => new Response(JSON.stringify({ text: 'Result' }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  return { accounts, fetch, service: new TelegramMcpService(accounts as never) };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('TELEGRAM_MCP_BRIDGE_URL', 'https://private.example.run.app');
  vi.stubEnv('TELEGRAM_API_ID', '123'); vi.stubEnv('TELEGRAM_API_HASH', 'a'.repeat(32));
  vi.stubEnv('TELEGRAM_SESSION_ENCRYPTION_KEY', Buffer.alloc(32, 1).toString('base64'));
  getIdTokenClient.mockResolvedValue({ getRequestHeaders: async () => new Headers({ authorization: 'Bearer identity-token' }) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('private MCP integration', () => {
  it('authenticates server-to-server, uses connected account lease, and releases it', async () => {
    const f = fixture(); const result = await f.service.call('get_chats', {});
    expect(result.text).toBe('Result'); expect(result.sessionFingerprint).toHaveLength(64);
    expect(getIdTokenClient).toHaveBeenCalledWith('https://private.example.run.app');
    expect(f.accounts.acquire).toHaveBeenCalledOnce(); expect(f.accounts.finish).toHaveBeenCalledOnce();
    const options = f.fetch.mock.calls[0]![1] as RequestInit;
    expect(options.redirect).toBe('error'); expect(JSON.parse(options.body as string)).toMatchObject({ name: 'get_chats', arguments: { page: 1, page_size: 20 } });
  });
  it('rejects unsupported tools, unconfirmed sends, and arbitrary account/format arguments', async () => {
    const f = fixture();
    await expect(f.service.call('delete_messages' as never, {})).rejects.toThrow();
    await expect(f.service.call('send_message', { chat_id: '42', message: 'Hi' })).rejects.toThrow('Explicit confirmation');
    await expect(f.service.call('get_chat', { chat_id: '42', account: 'other' })).rejects.toThrow();
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it('refuses confirmation after an account change', async () => {
    const f = fixture();
    await expect(f.service.call('send_message', { chat_id: '42', message: 'Hi' }, 'old-session')).rejects.toThrow('Telegram account changed');
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.accounts.finish).toHaveBeenCalledOnce();
  });
  it('fails safely without bridge configuration or on upstream error', async () => {
    const f = fixture(); vi.stubEnv('TELEGRAM_MCP_BRIDGE_URL', '');
    await expect(f.service.call('get_chats', {})).rejects.toThrow('not configured');
    expect(f.accounts.acquire).not.toHaveBeenCalled();
    vi.stubEnv('TELEGRAM_MCP_BRIDGE_URL', 'https://private.example.run.app');
    f.fetch.mockRejectedValueOnce(new Error('private provider data'));
    await expect(f.service.call('get_chats', {})).rejects.toThrow('could not be verified');
    expect(f.accounts.finish).toHaveBeenCalledOnce();
  });
});
