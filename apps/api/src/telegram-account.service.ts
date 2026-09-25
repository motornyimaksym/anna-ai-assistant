import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { telegramAccountStatusSchema, type TelegramAccountStatus } from '@booking/contracts';
import { TelegramAccountStore, decryptSession, encryptSession, type AccountRecord, type SessionPayload } from './telegram-account.store.js';
import { TelegramAccountTransport, type TelegramOperation } from './telegram-account.transport.js';

const expired = (record: AccountRecord) => (record.phase === 'code' || record.phase === 'password') && (record.expiresAt ?? 0) <= Date.now();
const clear = (record: AccountRecord): AccountRecord => ({ phase: 'disconnected', retryAt: record.retryAt, startRetryAt: record.startRetryAt });
const mask = (phone: string) => `••••${phone.slice(-4)}`;
const revoked = new Set(['AUTH_KEY_UNREGISTERED', 'AUTH_KEY_INVALID', 'SESSION_REVOKED', 'SESSION_EXPIRED', 'USER_DEACTIVATED', 'USER_DEACTIVATED_BAN']);

@Injectable()
export class TelegramAccountService {
  constructor(private readonly store: TelegramAccountStore, private readonly transport: TelegramAccountTransport) {}
  private config() {
    const apiId = Number(process.env.TELEGRAM_API_ID);
    const apiHash = process.env.TELEGRAM_API_HASH ?? '';
    const key = Buffer.from(process.env.TELEGRAM_SESSION_ENCRYPTION_KEY ?? '', 'base64');
    return Number.isSafeInteger(apiId) && apiId > 0 && /^[a-f\d]{32}$/i.test(apiHash) && key.length === 32 ? { apiId, apiHash, key } : undefined;
  }
  private view(record: AccountRecord, uid: string): TelegramAccountStatus {
    const visible = expired(record) || ((record.phase === 'code' || record.phase === 'password') && record.ownerUid !== uid) ? clear(record) : record;
    return telegramAccountStatusSchema.parse({ configured: !!this.config(), phase: visible.phase, maskedPhone: visible.maskedPhone, username: visible.username, expiresAt: visible.expiresAt });
  }
  async status(uid: string) { return this.view(await this.store.read(), uid); }
  async run(uid: string, operation: TelegramOperation, input?: string): Promise<TelegramAccountStatus> {
    const config = this.config();
    if (!config) throw new ServiceUnavailableException('Telegram account connection is not configured. Contact the administrator.');
    const lease = await this.store.acquire();
    let record = lease.record;
    let failure: unknown;
    try {
      if (expired(record)) record = clear(record);
      if ((record.phase === 'code' || record.phase === 'password') && record.ownerUid !== uid) throw new ForbiddenException('Another owner started this login. Wait until it expires.');
      if (((record.retryAt ?? 0) > Date.now() || (operation === 'start' && (record.startRetryAt ?? 0) > Date.now())) && operation !== 'disconnect') throw new HttpException('Please wait before trying Telegram again.', 429);
      if (operation === 'start' && record.phase === 'connected') throw new ConflictException('Disconnect the existing account first.');
      if ((operation === 'code' || operation === 'password') && record.phase !== operation) throw new BadRequestException('Login expired or step changed. Refresh and start again.');
      if (operation === 'check' && record.phase !== 'connected') throw new BadRequestException('Connect a Telegram account first.');
      if (operation === 'disconnect' && record.phase !== 'connected') {
        record = clear(record);
      } else {
        if (operation === 'code' || operation === 'password') {
          if ((record.attempts ?? 0) >= 5) { record = clear(record); throw new BadRequestException('Too many attempts. Start a new login.'); }
          record.attempts = (record.attempts ?? 0) + 1;
        }
        let payload: SessionPayload;
        if (operation === 'start') {
          record = { phase: 'disconnected', startRetryAt: Date.now() + 60_000 };
          payload = { session: '', phone: input };
        } else {
          if (!record.encrypted) throw new BadRequestException('Start a new Telegram login.');
          payload = decryptSession(record.encrypted, config.key);
        }
        const result = await this.transport.execute(config, payload, operation, input);
        if (operation === 'disconnect') record = clear(record);
        else if (operation === 'start') record = {
          phase: 'code', ownerUid: uid, expiresAt: Date.now() + 600_000, attempts: 0,
          startRetryAt: record.startRetryAt, maskedPhone: mask(input!),
          encrypted: encryptSession({ session: result.session, phone: input, phoneCodeHash: result.phoneCodeHash }, config.key),
        };
        else if (result.passwordNeeded) record = { ...record, phase: 'password', encrypted: encryptSession({ ...payload, session: result.session }, config.key) };
        else record = {
          phase: 'connected', maskedPhone: result.phone ? mask(result.phone) : record.maskedPhone,
          username: result.username, encrypted: encryptSession({ session: result.session }, config.key),
        };
      }
    } catch (error) {
      if (error instanceof HttpException) failure = error;
      else {
        const code = (error as { errorMessage?: string }).errorMessage ?? (error instanceof Error ? error.message : '');
        if (revoked.has(code)) {
          record = clear(record);
          if (operation !== 'disconnect') failure = new BadRequestException('Telegram session was revoked. Connect the account again.');
        } else if (code === 'PHONE_CODE_EXPIRED') {
          record = clear(record);
          failure = new BadRequestException('The code expired. Start a new login.');
        } else if (code.startsWith('FLOOD_WAIT') || code.startsWith('FLOOD_PREMIUM_WAIT')) {
          const seconds = Number((error as { seconds?: number }).seconds) || 60;
          record.retryAt = Date.now() + Math.min(Math.max(seconds, 1), 86400) * 1000;
          failure = new HttpException(`Telegram rate limit. Try again in ${Math.ceil((record.retryAt - Date.now()) / 1000)} seconds.`, 429);
        } else {
          const messages: Record<string, string> = {
            PHONE_CODE_INVALID: 'Incorrect Telegram code. Try again.', PASSWORD_HASH_INVALID: 'Incorrect two-step verification password. Try again.',
            PHONE_NUMBER_INVALID: 'Invalid phone number. Use international format.', PHONE_NUMBER_BANNED: 'Telegram cannot authorize this phone number.',
            API_ID_INVALID: 'Telegram API credentials are invalid. Contact the administrator.', SIGNUP_NOT_SUPPORTED: 'Use an existing Telegram account.',
            TELEGRAM_TIMEOUT: 'Telegram timed out. Refresh the connection status before retrying.',
          };
          failure = new BadRequestException(messages[code] ?? 'Could not connect to Telegram. Retry or cancel the login.');
        }
      }
    }
    await this.store.finish(lease.id, record);
    if (failure) throw failure;
    return this.view(record, uid);
  }
}
