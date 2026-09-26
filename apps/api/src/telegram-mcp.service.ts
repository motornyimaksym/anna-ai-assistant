import { Injectable, ServiceUnavailableException, ConflictException } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { TelegramAccountStore, decryptSession } from './telegram-account.store.js';
const peer = z.string().min(1).max(150);
const page = z.number().int().min(1).max(100).default(1);
const size = z.number().int().min(1).max(50).default(20);
export const mcpArguments = {
  get_chats: z.object({ page, page_size: size }).strict(),
  get_chat: z.object({ chat_id: peer }).strict(),
  get_messages: z.object({ chat_id: peer, page, page_size: size }).strict(),
  search_messages: z.object({ chat_id: peer, query: z.string().min(1).max(200), limit: size }).strict(),
  send_message: z.object({ chat_id: z.string().regex(/^-?\d+$/), message: z.string().min(1).max(4000) }).strict(),
  reply_to_message: z.object({ chat_id: z.string().regex(/^-?\d+$/), message_id: z.number().int().positive(), text: z.string().min(1).max(4000) }).strict(),
};
export type McpTool = keyof typeof mcpArguments;
export const readTools = new Set<McpTool>(['get_chats', 'get_chat', 'get_messages', 'search_messages']);
@Injectable()
export class TelegramMcpService {
  private readonly auth = new GoogleAuth();
  constructor(private readonly accounts: TelegramAccountStore) {}
  async call(name: McpTool, args: unknown, expectedSession?: string, signal?: AbortSignal): Promise<{ text: string; sessionFingerprint: string }> {
    if (!Object.hasOwn(mcpArguments, name)) throw new ConflictException('Unsupported Telegram operation');
    if (!readTools.has(name) && !expectedSession) throw new ConflictException('Explicit confirmation is required');
    const arguments_ = mcpArguments[name].parse(args);
    const origin = process.env.TELEGRAM_MCP_BRIDGE_URL;
    if (!origin || !/^https:\/\/[^/]+$/.test(origin)) throw new ServiceUnavailableException('Telegram workspace is not configured. Set up the private MCP bridge.');
    const key = Buffer.from(process.env.TELEGRAM_SESSION_ENCRYPTION_KEY ?? '', 'base64');
    const apiId = Number(process.env.TELEGRAM_API_ID); const apiHash = process.env.TELEGRAM_API_HASH;
    if (key.length !== 32 || !Number.isSafeInteger(apiId) || apiId <= 0 || !apiHash) throw new ServiceUnavailableException('Telegram account is not configured.');
    let tokenTimer: ReturnType<typeof setTimeout> | undefined;
    let authorization: string;
    try {
      authorization = await Promise.race([
        this.auth.getIdTokenClient(origin).then(async (client) => (await client.getRequestHeaders()).get('authorization')!),
        new Promise<never>((_, reject) => { tokenTimer = setTimeout(() => reject(new Error('Identity timeout')), 10_000); }),
      ]);
    } catch { throw new ServiceUnavailableException('Private Telegram bridge authentication is unavailable.'); }
    finally { clearTimeout(tokenTimer); }
    signal?.throwIfAborted();
    const lease = await this.accounts.acquire();
    try {
      if (lease.record.phase !== 'connected' || !lease.record.encrypted) throw new ServiceUnavailableException('Connect the Telegram account in Bot Settings first.');
      const { session } = decryptSession(lease.record.encrypted, key);
      const sessionFingerprint = createHash('sha256').update(session).digest('hex');
      if (expectedSession && expectedSession !== sessionFingerprint) throw new ConflictException('Telegram account changed. Create a new proposal.');
      const response = await fetch(`${origin}/call`, {
        method: 'POST', headers: { authorization, 'content-type': 'application/json' },
        signal: AbortSignal.any([AbortSignal.timeout(35_000), ...(signal ? [signal] : [])]), redirect: 'error',
        body: JSON.stringify({ name, arguments: arguments_, session, api_id: apiId, api_hash: apiHash }),
      });
      if (!response.ok) throw new Error('MCP call failed');
      const result = z.object({ text: z.string().max(24000) }).parse(await response.json());
      return { text: result.text, sessionFingerprint };
    } catch (error) {
      if (error instanceof ServiceUnavailableException || error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException('Telegram operation could not be verified. For sends, check Telegram before trying again.');
    } finally { await this.accounts.finish(lease.id, lease.record); }
  }
}
