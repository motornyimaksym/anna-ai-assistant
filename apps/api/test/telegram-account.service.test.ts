import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { TelegramAccountService } from '../src/telegram-account.service.js';
import { decryptSession, encryptSession, type AccountRecord, type TelegramAccountStore } from '../src/telegram-account.store.js';
import type { TelegramAccountTransport } from '../src/telegram-account.transport.js';

const key = randomBytes(32);
const original = { id: process.env.TELEGRAM_API_ID, hash: process.env.TELEGRAM_API_HASH, encryption: process.env.TELEGRAM_SESSION_ENCRYPTION_KEY };
const fixture = () => {
  let record: AccountRecord = { phase: 'disconnected' };
  let leased = false;
  const store = {
    read: vi.fn(async () => record),
    acquire: vi.fn(async () => {
      if (leased) throw new Error('locked');
      leased = true;
      return { id: 'lease', record: { ...record } };
    }),
    finish: vi.fn(async (_id: string, next: AccountRecord) => { record = next; leased = false; }),
  };
  const transport = { execute: vi.fn() };
  const service = new TelegramAccountService(store as unknown as TelegramAccountStore, transport as unknown as TelegramAccountTransport);
  return { service, store, transport, get: () => record, set: (value: AccountRecord) => { record = value; } };
};
beforeEach(() => {
  process.env.TELEGRAM_API_ID = '123456';
  process.env.TELEGRAM_API_HASH = 'a'.repeat(32);
  process.env.TELEGRAM_SESSION_ENCRYPTION_KEY = key.toString('base64');
});
afterAll(() => {
  for (const [name, value] of Object.entries({ TELEGRAM_API_ID: original.id, TELEGRAM_API_HASH: original.hash, TELEGRAM_SESSION_ENCRYPTION_KEY: original.encryption })) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

describe('Telegram account login', () => {
  it('encrypts a session with integrity protection', () => {
    const sealed = encryptSession({ session: 'private', phone: '+380501234567' }, key);
    expect(JSON.stringify(sealed)).not.toContain('private');
    expect(decryptSession(sealed, key)).toEqual({ session: 'private', phone: '+380501234567' });
    expect(() => decryptSession({ ...sealed, ciphertext: Buffer.from('changed').toString('base64') }, key)).toThrow();
  });
  it('completes code and 2FA login without saving secrets in clear text', async () => {
    const { service, transport, get } = fixture();
    transport.execute.mockResolvedValueOnce({ session: 'pending', phoneCodeHash: 'hash' }).mockResolvedValueOnce({ session: 'pending', passwordNeeded: true }).mockResolvedValueOnce({ session: 'authorized', phone: '380501234567', username: 'owner' });
    expect(await service.run('uid', 'start', '+380501234567')).toMatchObject({ phase: 'code', maskedPhone: '••••4567' });
    expect(JSON.stringify(get())).not.toContain('hash');
    expect(await service.run('uid', 'code', '12345')).toMatchObject({ phase: 'password' });
    expect(await service.run('uid', 'password', 'secret')).toMatchObject({ phase: 'connected', username: 'owner' });
    expect(JSON.stringify(get())).not.toContain('secret');
    expect(decryptSession(get().encrypted!, key)).toEqual({ session: 'authorized' });
    await expect(service.run('uid', 'start', '+380501234567')).rejects.toThrow('Disconnect');
  });
  it('rejects another owner and clears expired pending login', async () => {
    const { service, set, transport } = fixture();
    set({ phase: 'code', ownerUid: 'a', expiresAt: Date.now() + 30_000, encrypted: encryptSession({ session: 'pending', phone: '+380501234567', phoneCodeHash: 'h' }, key) });
    await expect(service.run('b', 'code', '12345')).rejects.toThrow('Another owner');
    expect(transport.execute).not.toHaveBeenCalled();
    expect(await service.status('b')).toMatchObject({ phase: 'disconnected' });
    set({ phase: 'code', ownerUid: 'a', expiresAt: Date.now() - 1 });
    expect(await service.status('a')).toMatchObject({ phase: 'disconnected' });
  });
  it('limits wrong-code attempts and preserves pending session for retries', async () => {
    const { service, set, transport, get } = fixture();
    set({ phase: 'code', ownerUid: 'a', expiresAt: Date.now() + 30_000, attempts: 0, encrypted: encryptSession({ session: 'pending', phone: '+380501234567', phoneCodeHash: 'h' }, key) });
    transport.execute.mockRejectedValue({ errorMessage: 'PHONE_CODE_INVALID' });
    for (let i = 0; i < 5; i++) await expect(service.run('a', 'code', '12345')).rejects.toThrow('Incorrect Telegram code');
    expect(get().attempts).toBe(5);
    await expect(service.run('a', 'code', '12345')).rejects.toThrow('Too many attempts');
    expect(get().phase).toBe('disconnected');
    expect(transport.execute).toHaveBeenCalledTimes(5);
  });
  it('keeps a connected session if remote logout fails', async () => {
    const { service, set, transport, get } = fixture();
    set({ phase: 'connected', encrypted: encryptSession({ session: 'authorized' }, key) });
    transport.execute.mockRejectedValueOnce(new Error('network failed')).mockResolvedValueOnce({ session: '' });
    await expect(service.run('a', 'disconnect')).rejects.toThrow('Could not connect');
    expect(get().phase).toBe('connected');
    expect(await service.run('a', 'disconnect')).toMatchObject({ phase: 'disconnected' });
    expect(get().encrypted).toBeUndefined();
  });
  it('does not expose credentials in status when configuration is absent', async () => {
    const { service } = fixture();
    delete process.env.TELEGRAM_SESSION_ENCRYPTION_KEY;
    expect(await service.status('a')).toEqual({ configured: false, phase: 'disconnected' });
    await expect(service.run('a', 'start', '+380501234567')).rejects.toThrow('not configured');
  });
});
