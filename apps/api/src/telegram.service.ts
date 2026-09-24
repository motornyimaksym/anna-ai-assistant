import { waitForResponsePacing } from './response-pacing.js';
import { OpenAiService } from './openai.service.js';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import type { ConversationDto } from '@booking/contracts';
import { loadBackendRuntimeEnv } from '@booking/config';
import { BookingRepository } from './repository.js';
const messageSchema = z.object({ message_id: z.number().int(), chat: z.object({ id: z.union([z.string(), z.number()]), type: z.string().optional() }), from: z.object({ id: z.union([z.string(), z.number()]), username: z.string().optional(), is_bot: z.boolean().optional() }).optional(), text: z.string().optional(), business_connection_id: z.string().optional() });
const updateSchema = z.object({ update_id: z.number().int(), business_message: messageSchema.optional(), message: messageSchema.optional() });
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly allowedUsername = loadBackendRuntimeEnv(process.env).TELEGRAM_ALLOWED_USERNAME?.toLowerCase();
  constructor(private readonly repository: BookingRepository, private readonly assistant: OpenAiService) {}
  async handle(secret: string | undefined, body: unknown): Promise<void> {
    if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) throw new UnauthorizedException('Invalid webhook secret');
    const update = updateSchema.parse(body);
    const message = update.business_message ?? (update.message?.chat.type === 'private' ? update.message : undefined);
    if (message?.from?.is_bot || (message?.chat.type && message.chat.type !== 'private') || !this.allowedUsername || message?.from?.username?.toLowerCase() !== this.allowedUsername || !message.text) return;
    if (!await this.repository.claimTelegramUpdate(update.update_id)) return;
    const chatId = String(message.chat.id); const now = new Date().toISOString();
    const current = await this.repository.getConversation(chatId); const conversation: ConversationDto = current ?? { telegramChatId: chatId, clientId: message.from ? String(message.from.id) : undefined, businessConnectionId: message.business_connection_id, assistantEnabled: true, state: 'active', summary: '', createdAt: now, updatedAt: now };
    if (!conversation.assistantEnabled || (conversation.humanTakeoverUntil && conversation.humanTakeoverUntil > now)) { await this.repository.saveConversation({ ...conversation, updatedAt: now }); return; }
    await this.repository.saveConversation({ ...conversation, updatedAt: now });
    const stopTyping = await this.startTyping(chatId, message.business_connection_id);
    let reply: string;
    try {
      const answer = await this.assistant.respond(conversation, { clientId: String(message.from!.id), telegramChatId: chatId, businessConnectionId: message.business_connection_id }, message.text);
      if (answer.fromOpenAI) await waitForResponsePacing(answer.text);
      reply = answer.text;
    } finally {
      stopTyping();
    }
    await this.repository.appendMessage(chatId, 'user', message.text.slice(0, 4000));
    await this.reply(chatId, message.business_connection_id, reply);
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
  private async reply(chatId: string, businessConnectionId: string | undefined, text: string): Promise<void> { const token = process.env.TELEGRAM_BOT_TOKEN; if (!token) throw new Error('Telegram token not configured'); const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', signal: AbortSignal.timeout(10_000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text, ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}) }) }); if (!response.ok) throw new Error('Telegram reply failed'); }
}
