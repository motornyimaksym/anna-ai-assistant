import { withRequestDiagnostics } from './request-diagnostics.js';
import { randomUUID } from 'node:crypto';
import { DebugLogService, humanErrorContext, safeErrorCategory, safeErrorDiagnostic } from './debug-log.service.js';
import { waitForRandomReadDelay, waitForResponsePacing } from './response-pacing.js';
import { OpenAiService } from './openai.service.js';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { type ConversationDto } from '@booking/contracts';
import { loadBackendRuntimeEnv } from '@booking/config';
import { BookingRepository } from './repository.js';
import { DEFAULT_BOT_SETTINGS } from './bot-settings.js';
import { HumanAssistanceService } from './human-assistance.service.js';
import { TelegramScheduleImportService } from './telegram-schedule-import.service.js';
import { fetchWithLinearBackoff } from '@booking/http';
import { TextUtils } from './text-utils.js';
const messageSchema = z.object({ message_id: z.number().int(), chat: z.object({ id: z.union([z.string(), z.number()]), type: z.string().optional() }), from: z.object({ id: z.union([z.string(), z.number()]), username: z.string().optional(), is_bot: z.boolean().optional() }).optional(), text: z.string().optional(), business_connection_id: z.string().optional() });
const updateSchema = z.object({ update_id: z.number().int(), business_message: messageSchema.optional(), message: messageSchema.optional(), deleted_business_messages: z.object({ business_connection_id: z.string().min(1), chat: z.object({ id: z.union([z.string(), z.number()]) }), message_ids: z.array(z.number().int()).min(1) }).optional() });
const escapeHtml = (value: string) => value.replace(/&(?!(?:amp|lt|gt|quot|#39|#\d+|#x[\da-f]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const formatTelegramHtml = (value: string): string => {
  const markdown = TextUtils.replaceLongDashes(value).replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g, (_match, a: string | undefined, b: string | undefined) => `<b>${a ?? b}</b>`).replace(/\*\*|__/g, '');
  let result = ''; let openTag: 'b' | 'i' | 'code' | undefined; let cursor = 0;
  const token = /<\/?(?:b|i|code)>/gi;
  for (const match of markdown.matchAll(token)) {
    const index = match.index!; const rawTag = match[0]!;
    result += escapeHtml(markdown.slice(cursor, index)); cursor = index + rawTag.length;
    const closing = rawTag.startsWith('</'); const tag = rawTag.replace(/[</>]/g, '').toLowerCase() as 'b' | 'i' | 'code';
    if (closing && openTag === tag) { result += `</${tag}>`; openTag = undefined; }
    else if (!closing && !openTag) { result += `<${tag}>`; openTag = tag; }
    else result += escapeHtml(rawTag);
  }
  result += escapeHtml(markdown.slice(cursor));
  if (openTag) result += `</${openTag}>`;
  return result;
};
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly allowedUsername = loadBackendRuntimeEnv(process.env).TELEGRAM_ALLOWED_USERNAME?.toLowerCase();
  constructor(private readonly repository: BookingRepository, private readonly assistant: OpenAiService, private readonly human: HumanAssistanceService, private readonly scheduleImport: TelegramScheduleImportService, private readonly debug: DebugLogService) {}
  async handle(secret: string | undefined, body: unknown): Promise<void> {
    if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) throw new UnauthorizedException('Invalid webhook secret');
    const update = updateSchema.parse(body);
    if (update.deleted_business_messages) {
      if (!await this.repository.claimTelegramUpdate(update.update_id)) return;
      await this.repository.resetDeletedBusinessChat(String(update.deleted_business_messages.chat.id), update.deleted_business_messages.business_connection_id);
      return;
    }
    if (!update.business_message && !update.message) return;
    const scheduleRefresh = this.scheduleImport.syncIfDue().catch(() => { this.logger.warn('Telegram schedule import failed; incoming message processing continues'); });
    await scheduleRefresh;
    await this.processUpdate(update);
  }
  private async processUpdate(update: z.infer<typeof updateSchema>): Promise<void> {
    const message = update.business_message ?? (update.message?.chat.type === 'private' ? update.message : undefined);
    const trace = { telegramChatId: String(message?.chat.id ?? 'unknown'), traceId: randomUUID() };
    return withRequestDiagnostics((request, bodies) => this.debug.record(trace, 'provider_request', { request }, request.errorCategory ? 'error' : request.responseStatus === 'incomplete' ? 'warn' : 'info', bodies), () => this.processTracedUpdate(update, trace));
  }
  private async processTracedUpdate(update: z.infer<typeof updateSchema>, trace: { telegramChatId: string; traceId: string }): Promise<void> {
    const message = update.business_message ?? (update.message?.chat.type === 'private' ? update.message : undefined);
    const responder = update.message?.chat.type === 'private' ? update.message : undefined;
    const responderCommand = responder?.text?.trim();
    const isAnswerCommand = Boolean(responderCommand && /^\/answer(?:@[a-zA-Z0-9_]+)?(?:\s|$)/i.test(responderCommand));
    if (responder?.from?.username && !responder.from.is_bot && responderCommand && (responderCommand === '/start' || isAnswerCommand)) {
      const userId = String(responder.from.id);
      const chatId = String(responder.chat.id);
      const username = responder.from.username.toLowerCase();
      if (responderCommand === '/start' && await this.human.isConfiguredUsername(username)) {
        if (!await this.repository.claimTelegramUpdate(update.update_id)) return;
        if (await this.human.enroll(userId, chatId, username)) await this.human.send(chatId, undefined, 'Підключено. Запити на допомогу надходитимуть сюди.');
        return;
      }
      if (await this.human.authorizedResponder(userId, chatId, username)) {
        if (!await this.repository.claimTelegramUpdate(update.update_id)) return;
        const match = /^\/answer(?:@[a-zA-Z0-9_]+)?\s+(\S+)(?:\s+([\s\S]+))?$/i.exec(responderCommand);
        if (!match || !match[1] || !match[2]?.trim()) { await this.human.send(chatId, undefined, 'Формат: /answer <номер запиту> <текст>'); return; }
        try {
          await this.human.reply(match[1], match[2].trim(), `telegram:${userId}`);
          await this.human.send(chatId, undefined, 'Відповідь надіслано клієнту.');
        } catch { await this.human.send(chatId, undefined, 'Не вдалося надіслати відповідь. Перевірте стан запиту в адмінпанелі.'); }
        return;
      }
    }
    if (isAnswerCommand) return;
    if (message?.from?.is_bot || (message?.chat.type && message.chat.type !== 'private') || !this.allowedUsername || message?.from?.username?.toLowerCase() !== this.allowedUsername || !message.text) { await this.debug.record(trace, 'ignored', { reason: 'sender_or_message_not_eligible' }); return; }
    if (!await this.repository.claimTelegramUpdate(update.update_id)) { await this.debug.record(trace, 'ignored', { reason: 'duplicate_update' }); return; }
    await this.debug.record(trace, 'received');
    const chatId = String(message.chat.id); const now = new Date().toISOString();
    const current = await this.repository.getConversation(chatId); const clientId = message.from ? String(message.from.id) : undefined; const conversation: ConversationDto = current && current.clientId === clientId ? current : { telegramChatId: chatId, clientId, businessConnectionId: message.business_connection_id, assistantEnabled: true, state: 'active', summary: '', createdAt: now, updatedAt: now };
    if (current && current.clientId !== clientId) await this.repository.resetTelegramConversationIdentity(conversation);
    if (!conversation.assistantEnabled || (conversation.humanTakeoverUntil && conversation.humanTakeoverUntil > now)) { await this.debug.record(trace, 'ignored', { reason: conversation.assistantEnabled ? 'manual_takeover' : 'assistant_disabled' }); await this.repository.touchConversation({ ...conversation, updatedAt: now }); return; }
    await this.repository.touchConversation({ ...conversation, updatedAt: now });
    const settings = await this.repository.getBotSettingsOverride() ?? DEFAULT_BOT_SETTINGS;
    if (update.business_message?.business_connection_id) {
      await waitForRandomReadDelay(settings.maxReadDelayMs);
      await this.markBusinessMessageRead(update.business_message.business_connection_id, message.chat.id, message.message_id);
    }
    if (conversation.activeHumanRequestId) {
      await this.debug.record(trace, 'human_paused', { requestId: conversation.activeHumanRequestId });
      await this.repository.appendMessage(chatId, 'user', message.text.slice(0, 4000));
      await this.human.queueExisting(conversation.activeHumanRequestId, message.text, update.update_id);
      return;
    }
    await this.debug.record(trace, 'assistant_started');
    const stopTyping = await this.startTyping(chatId, message.business_connection_id);
    let reply: string;
    let parseMode: 'HTML' | undefined;
    try {
      const answer = await this.assistant.respond(conversation, { clientId: String(message.from!.id), telegramChatId: chatId, businessConnectionId: message.business_connection_id, traceId: trace.traceId }, message.text);
      if (answer.needsHuman) {
        await this.debug.record(trace, 'handoff', { reason: 'assistant_requested_human' }, 'warn');
        await this.repository.appendMessage(chatId, 'user', message.text.slice(0, 4000));
        await this.human.escalateError(chatId, message.business_connection_id, update.update_id, message.text, answer.humanContext);
        return;
      }
      const outgoingText = TextUtils.replaceLongDashes(answer.text);
      if (answer.fromOpenAI) await waitForResponsePacing(outgoingText, settings.typingDelayPerSymbolMs);
      reply = answer.fromOpenAI ? formatTelegramHtml(outgoingText) : outgoingText;
      if (answer.fromOpenAI) parseMode = 'HTML';
    } catch (error) {
      await this.debug.record(trace, 'error', { reason: 'assistant_operation_failed', errorCategory: safeErrorCategory(error) }, 'error');
      this.logger.error(`Assistant operation failed update=${update.update_id} trace=${trace.traceId}: ${JSON.stringify(safeErrorDiagnostic(error, [message.text]))}`);
      await this.human.escalateError(chatId, message.business_connection_id, update.update_id, message.text, humanErrorContext(error, 'assistant turn', [message.text]));
      return;
    } finally {
      stopTyping();
    }
    await this.repository.appendMessage(chatId, 'user', message.text.slice(0, 4000));
    try {
      if (!await this.human.approveOutgoing(chatId, message.business_connection_id, update.update_id, message.text, reply)) return;
      await this.reply(chatId, message.business_connection_id, reply, parseMode);
      await this.repository.appendMessage(chatId, 'assistant', reply);
      await this.debug.record(trace, 'reply_sent');
    } catch (error) {
      await this.debug.record(trace, 'reply_failed', { reason: 'delivery_or_persistence_uncertain', errorCategory: safeErrorCategory(error) }, 'error');
      this.logger.error(`Telegram reply failed or is uncertain update=${update.update_id} trace=${trace.traceId}: ${JSON.stringify(safeErrorDiagnostic(error, [message.text, reply]))}`);
      await this.human.escalateError(chatId, message.business_connection_id, update.update_id, message.text, `Client reply delivery or persistence is uncertain. Check before resending. ${humanErrorContext(error, 'Telegram delivery', [message.text, reply])}`);
    }
  }
  private async startTyping(chatId: string, businessConnectionId: string | undefined): Promise<() => void> {
    if (!process.env.TELEGRAM_BOT_TOKEN) return () => undefined;
    let pending = false;
    const pulse = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetchWithLinearBackoff(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, action: 'typing', ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}) }),
        }, { replaySafe: true, timeoutMs: 10_000 });
        if (!response.ok) this.logger.warn('Telegram typing indicator request failed');
      } catch (error) {
        this.logger.error(`Telegram typing indicator request failed: ${JSON.stringify(safeErrorDiagnostic(error, [chatId]))}`);
      } finally {
        pending = false;
      }
    };
    await pulse();
    const timer = setInterval(() => { void pulse(); }, 4_000);
    return () => clearInterval(timer);
  }
  private async markBusinessMessageRead(businessConnectionId: string, chatId: string | number, messageId: number): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const numericChatId = Number(chatId);
    if (!token || !Number.isSafeInteger(numericChatId)) return;
    try {
      const response = await fetchWithLinearBackoff(`https://api.telegram.org/bot${token}/readBusinessMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ business_connection_id: businessConnectionId, chat_id: numericChatId, message_id: messageId }),
      }, { replaySafe: true, timeoutMs: 10_000 });
      const result = await response.json().catch(() => undefined) as { ok?: boolean } | undefined;
      if (!response.ok || result?.ok === false) this.logger.warn('Telegram read receipt request failed');
    } catch (error) {
      this.logger.error(`Telegram read receipt request failed: ${JSON.stringify(safeErrorDiagnostic(error, [String(chatId)]))}`);
    }
  }
  private async reply(chatId: string, businessConnectionId: string | undefined, text: string, parseMode?: 'HTML'): Promise<void> { const token = process.env.TELEGRAM_BOT_TOKEN; if (!token) throw new Error('Telegram token not configured'); const response = await fetchWithLinearBackoff(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text, ...(parseMode ? { parse_mode: parseMode } : {}), ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}) }) }, { timeoutMs: 10_000 }); const providerRequestId = response.headers?.get('x-request-id') ?? undefined; if (!response.ok) throw Object.assign(new Error(`Telegram HTTP ${response.status}`), { upstreamStatus: response.status, providerRequestId }); const result = await response.json().catch(() => undefined) as { ok?: boolean } | undefined; if (result?.ok !== true) throw Object.assign(new Error('Telegram message delivery was not confirmed'), { upstreamStatus: response.status, providerRequestId }); }
}
