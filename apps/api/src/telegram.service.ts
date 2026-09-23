import { Injectable, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import type { ConversationDto } from '@booking/contracts';
import { BookingRepository } from './repository.js';
const updateSchema = z.object({ update_id: z.number().int(), business_connection: z.object({ id: z.string() }).optional(), business_message: z.object({ message_id: z.number().int(), chat: z.object({ id: z.union([z.string(), z.number()]) }), from: z.object({ id: z.union([z.string(), z.number()]), username: z.string().optional(), first_name: z.string().optional() }).optional(), text: z.string().optional(), business_connection_id: z.string().optional() }).optional(), edited_business_message: z.unknown().optional(), deleted_business_messages: z.unknown().optional() });
@Injectable()
export class TelegramService {
  constructor(private readonly repository: BookingRepository) {}
  async handle(secret: string | undefined, body: unknown): Promise<void> {
    if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) throw new UnauthorizedException('Invalid webhook secret');
    const update = updateSchema.parse(body); if (!await this.repository.claimTelegramUpdate(update.update_id)) return;
    const message = update.business_message; if (!message?.text) return; const chatId = String(message.chat.id); const now = new Date().toISOString();
    const current = await this.repository.getConversation(chatId); const conversation: ConversationDto = current ?? { telegramChatId: chatId, clientId: message.from ? String(message.from.id) : undefined, businessConnectionId: message.business_connection_id, assistantEnabled: true, state: 'active', summary: '', createdAt: now, updatedAt: now };
    if (!conversation.assistantEnabled || (conversation.humanTakeoverUntil && conversation.humanTakeoverUntil > now)) { await this.repository.saveConversation({ ...conversation, updatedAt: now }); return; }
    await this.repository.saveConversation({ ...conversation, updatedAt: now });
    await this.reply(chatId, message.business_connection_id, 'Вітаю! Допоможу з записом на масаж. Напишіть, яка послуга або дата вас цікавить.');
  }
  private async reply(chatId: string, businessConnectionId: string | undefined, text: string): Promise<void> { const token = process.env.TELEGRAM_BOT_TOKEN; if (!token) return; const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text, ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}) }) }); if (!response.ok) throw new Error('Telegram reply failed'); }
}
