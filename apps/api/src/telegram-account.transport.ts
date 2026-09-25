import { Injectable } from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Logger, LogLevel } from 'telegram/extensions/Logger.js';
import { computeCheck } from 'telegram/Password.js';
import type { SessionPayload } from './telegram-account.store.js';

export type TelegramOperation = 'start' | 'code' | 'password' | 'check' | 'disconnect';
export type TransportResult = { session: string; phoneCodeHash?: string; passwordNeeded?: boolean; username?: string; phone?: string };
export type TelegramCredentials = { apiId: number; apiHash: string };
@Injectable()
export class TelegramAccountTransport {
  async execute(credentials: TelegramCredentials, payload: SessionPayload, operation: TelegramOperation, input?: string): Promise<TransportResult> {
    const session = new StringSession(payload.session);
    const client = new TelegramClient(session, credentials.apiId, credentials.apiHash, {
      connectionRetries: 1, requestRetries: 2, autoReconnect: false, floodSleepThreshold: 0,
      baseLogger: new Logger(LogLevel.NONE), deviceModel: 'Booking Admin', appVersion: '1.0',
    });
    // Never expose library errors (they can contain request arguments).
    client.onError = async () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    const work = async (): Promise<TransportResult> => {
      await client.connect();
      if (expired) throw new Error('TELEGRAM_TIMEOUT');
      if (operation === 'start') {
        const result = await client.sendCode(credentials, input!);
        return { session: session.save(), phoneCodeHash: result.phoneCodeHash };
      }
      if (operation === 'code') {
        try {
          const result = await client.invoke(new Api.auth.SignIn({ phoneNumber: payload.phone!, phoneCodeHash: payload.phoneCodeHash!, phoneCode: input! }));
          if (result instanceof Api.auth.AuthorizationSignUpRequired) throw new Error('SIGNUP_NOT_SUPPORTED');
        } catch (error) {
          if ((error as { errorMessage?: string }).errorMessage === 'SESSION_PASSWORD_NEEDED') return { session: session.save(), passwordNeeded: true };
          throw error;
        }
      }
      if (operation === 'password') {
        const password = await client.invoke(new Api.account.GetPassword());
        if (expired) throw new Error('TELEGRAM_TIMEOUT');
        const check = await computeCheck(password, input!);
        if (expired) throw new Error('TELEGRAM_TIMEOUT');
        await client.invoke(new Api.auth.CheckPassword({ password: check }));
      }
      if (expired) throw new Error('TELEGRAM_TIMEOUT');
      if (operation === 'disconnect') {
        await client.invoke(new Api.auth.LogOut());
        return { session: '' };
      }
      const me = await client.getMe();
      if (me.bot) throw new Error('USER_ACCOUNT_REQUIRED');
      return { session: session.save(), ...(me.username ? { username: me.username } : {}), ...(me.phone ? { phone: me.phone } : {}) };
    };
    const pending = work();
    // If a connection finishes after timeout, also close its late socket.
    void pending.finally(() => { if (expired) void client.destroy().catch(() => {}); }).catch(() => {});
    try {
      return await Promise.race([pending, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { expired = true; reject(new Error('TELEGRAM_TIMEOUT')); }, 20_000);
      })]);
    } finally {
      clearTimeout(timer);
      if (!expired) await client.destroy().catch(() => {});
    }
  }
}
