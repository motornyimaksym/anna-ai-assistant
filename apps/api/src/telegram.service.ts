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
const messageSchema = z.object({ message_id: z.number().int(), chat: z.object({ id: z.union([z.string(), z.number()]), type: z.string().optional() }), from: z.object({ id: z.union([z.string(), z.number()]), username: z.string().optional(), is_bot: z.boolean().optional() }).optional(), text: z.string().optional(), business_connection_id: z.string().optional() });
const updateSchema = z.object({ update_id: z.number().int(), business_message: messageSchema.optional(), message: messageSchema.optional() });
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly allowedUsername = loadBackendRuntimeEnv(process.env).TELEGRAM_ALLOWED_USERNAME?.toLowerCase();
  constructor(private readonly repository: BookingRepository, private readonly assistant: OpenAiService, private readonly human: HumanAssistanceService, private readonly scheduleImport: TelegramScheduleImportService) {}
  async handle(secret: string | undefined, body: unknown): Promise<void> {
    if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) throw new UnauthorizedException('Invalid webhook secret');
    const update = updateSchema.parse(body);
    if (!update.business_message && !update.message) return;
    const scheduleRefresh = this.scheduleImport.syncIfDue().catch(() => { this.logger.warn('Telegram schedule import failed; incoming message processing continues'); });
    try { await this.processUpdate(update); } finally { await scheduleRefresh; }
  }
  private async processUpdate(update: z.infer<typeof updateSchema>): Promise<void> {
    const message = update.business_message ?? (update.message?.chat.type === 'private' ? update.message : undefined);
    const responder = update.message?.chat.type === 'private' ? update.message : undefined;
    const responderCommand = responder?.text?.trim();
    if (responder?.from?.username && !responder.from.is_bot && responderCommand && (responderCommand === '/start' || responderCommand.startsWith('/answer '))) {
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
        const match = /^\/answer\s+(\S+)\s+([\s\S]+)$/i.exec(responderCommand);
        if (!match || !match[1] || !match[2]?.trim()) { await this.human.send(chatId, undefined, 'Формат: /answer <номер запиту> <текст>'); return; }
        try {
          await this.human.reply(match[1], match[2].trim(), `telegram:${userId}`);
          await this.human.send(chatId, undefined, 'Відповідь надіслано клієнту.');
        } catch { await this.human.send(chatId, undefined, 'Не вдалося надіслати відповідь. Перевірте стан запиту в адмінпанелі.'); }
        return;
      }
    }
    if (responderCommand?.startsWith('/answer ')) return;
    if (message?.from?.is_bot || (message?.chat.type && message.chat.type !== 'private') || !this.allowedUsername || message?.from?.username?.toLowerCase() !== this.allowedUsername || !message.text) return;
    if (!await this.repository.claimTelegramUpdate(update.update_id)) return;
    const chatId = String(message.chat.id); const now = new Date().toISOString();
    const current = await this.repository.getConversation(chatId); const conversation: ConversationDto = current ?? { telegramChatId: chatId, clientId: message.from ? String(message.from.id) : undefined, businessConnectionId: message.business_connection_id, assistantEnabled: true, state: 'active', summary: '', createdAt: now, updatedAt: now };
    if (!conversation.assistantEnabled || (conversation.humanTakeoverUntil && conversation.humanTakeoverUntil > now)) { await this.repository.saveConversation({ ...conversation, updatedAt: now }); return; }
    await this.repository.saveConversation({ ...conversation, updatedAt: now });
    const settings = await this.repository.getBotSettingsOverride() ?? DEFAULT_BOT_SETTINGS;
    if (update.business_message?.business_connection_id) {
      await waitForRandomReadDelay(settings.maxReadDelayMs);
      await this.markBusinessMessageRead(update.business_message.business_connection_id, message.chat.id, message.message_id);
    }
    if (conversation.activeHumanRequestId) {
      await this.repository.appendMessage(chatId, 'user', message.text.slice(0, 4000));
      await this.human.queueExisting(conversation.activeHumanRequestId, message.text, update.update_id);
      return;
    }
    if (!['/confirm', '/cancel'].includes(message.text.trim().toLowerCase()) && message.text.length <= 4000) {
      const decision = await this.human.decide(conversation, message.text);
      if (decision.route === 'human') {
        await this.repository.appendMessage(chatId, 'user', message.text);
        await this.human.escalate(chatId, message.business_connection_id, update.update_id, message.text, decision);
        return;
      }
    }
    const stopTyping = await this.startTyping(chatId, message.business_connection_id);
    let reply: string;
    let parseMode: 'HTML' | undefined;
    try {
      const answer = await this.assistant.respond(conversation, { clientId: String(message.from!.id), telegramChatId: chatId, businessConnectionId: message.business_connection_id }, message.text);
      if (answer.fromOpenAI) await waitForResponsePacing(answer.text, settings.typingDelayPerSymbolMs);
      reply = answer.text;
      if (answer.fromOpenAI) parseMode = 'HTML';
    } finally {
      stopTyping();
    }
    await this.repository.appendMessage(chatId, 'user', message.text.slice(0, 4000));
    await this.reply(chatId, message.business_connection_id, reply, parseMode);
    await this.repository.appendMessage(chatId, 'assistant', reply);
  }
  private async startTyping(chatId: string, businessConnectionId: string | undefined): Promise<() => void> {
    if (!process.env.TELEGRAM_BOT_TOKEN) return () => undefined;
    let pending = false;
    const pulse = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
          method: 'POST', signal: AbortSignal.timeout(10_000), headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, action: 'typing', ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}) }),
        });
        if (!response.ok) this.logger.warn('Telegram typing indicator request failed');
      } catch {
        this.logger.warn('Telegram typing indicator request failed');
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
      const response = await fetch(`https://api.telegram.org/bot${token}/readBusinessMessage`, {
        method: 'POST', signal: AbortSignal.timeout(10_000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ business_connection_id: businessConnectionId, chat_id: numericChatId, message_id: messageId }),
      });
      const result = await response.json().catch(() => undefined) as { ok?: boolean } | undefined;
      if (!response.ok || result?.ok === false) this.logger.warn('Telegram read receipt request failed');
    } catch {
      this.logger.warn('Telegram read receipt request failed');
    }
  }
  private async reply(chatId: string, businessConnectionId: string | undefined, text: string, parseMode?: 'HTML'): Promise<void> { const token = process.env.TELEGRAM_BOT_TOKEN; if (!token) throw new Error('Telegram token not configured'); const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', signal: AbortSignal.timeout(10_000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text, ...(parseMode ? { parse_mode: parseMode } : {}), ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}) }) }); if (!response.ok) throw new Error('Telegram reply failed'); }
}
