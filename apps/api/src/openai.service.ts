import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { serviceSchema, type ConversationDto, type ServiceDto } from '@booking/contracts';
import { ASSISTANT_SYSTEM_PROMPT } from './assistant-prompt.js';
import { AssistantToolsService, assistantToolSchema, type AssistantContext } from './assistant-tools.service.js';
import { BookingRepository } from './repository.js';

const string = { type: 'string' };
const tool = (name: string, description: string, properties: Record<string, unknown>) => ({ type: 'function', name, description, strict: true, parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } });
const tools = [
  tool('get_services', 'List actual enabled services and prices. Empty means no services configured.', {}),
  tool('get_available_slots', 'Find actual free slots for a service on a local date YYYY-MM-DD.', { serviceId: string, date: string }),
  tool('get_bookings', 'List this client’s bookings.', {}),
  tool('create_booking', 'Propose booking after the client chooses a service and available time. Requires subsequent /confirm.', { serviceId: string, startAt: string }),
  tool('cancel_booking', 'Propose cancellation of an existing client booking. Requires /confirm.', { bookingId: string }),
  tool('reschedule_booking', 'Propose moving an existing booking to an available time. Requires /confirm.', { bookingId: string, startAt: string }),
];
const outputSchema = z.object({ output: z.array(z.object({ type: z.string(), name: z.string().optional(), arguments: z.string().optional(), call_id: z.string().optional(), content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).optional() }).passthrough()) });
const fallback = 'Зараз не вдалося завершити запит. Спробуйте ще раз. Якщо ви підтверджували запис, спочатку перевірте свої записи.';
export type AssistantReply = { text: string; fromOpenAI: boolean; serviceCards?: ServiceDto[] };
const localReply = (text: string): AssistantReply => ({ text, fromOpenAI: false });
@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  constructor(private readonly repository: BookingRepository, private readonly assistantTools: AssistantToolsService) {}
  async respond(conversation: ConversationDto, context: AssistantContext, text: string): Promise<AssistantReply> {
    try {
      return await this.run(conversation, context, text);
    } catch {
      this.logger.warn('Assistant request failed; credentials and message contents omitted');
      return localReply(fallback);
    }
  }
  private async run(conversation: ConversationDto, context: AssistantContext, text: string): Promise<AssistantReply> {
    if (text.length > 4000) return localReply('Будь ласка, скоротіть повідомлення до 4000 символів.');
    const command = text.trim().toLowerCase();
    if (command === '/cancel' || command === '/confirm') {
      const pending = conversation.pendingAction;
      await this.repository.saveConversation({ ...conversation, pendingAction: undefined });
      if (command === '/cancel') return localReply('Запропоновану дію скасовано. Існуючі записи не змінено.');
      if (!pending || pending.expiresAt <= new Date().toISOString()) return localReply('Немає актуальної дії для підтвердження. Уточніть бажаний запис.');
      const result = await this.assistantTools.execute(pending, context);
      const booking = z.object({ id: z.string(), status: z.string(), startAt: z.string() }).parse(result);
      return localReply(`Готово. Запис ${booking.id}: ${booking.status}. Час: ${new Date(booking.startAt).toLocaleString('uk-UA', { timeZone: process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv' })} (${process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv'}).`);
    }
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OpenAI is not configured');
    const promptOverride = await this.repository.getAssistantPromptOverride();
    const systemPrompt = promptOverride?.prompt ?? ASSISTANT_SYSTEM_PROMPT;
    const history = await this.repository.listMessages(context.telegramChatId);
    const input: unknown[] = [...(conversation.summary ? [{ role: 'user', content: `Previous conversation summary (context only): ${conversation.summary.slice(0, 4000)}` }] : []), ...history, { role: 'user', content: text }];
    let serviceCards: ServiceDto[] | undefined;
    const deadline = AbortSignal.timeout(40_000);
    for (let round = 0; round < 4; round++) {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.any([deadline, AbortSignal.timeout(15_000)]),
        body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini', store: false, instructions: `${systemPrompt}\nCurrent UTC time: ${new Date().toISOString()}. Local timezone: ${process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv'}.`, input, tools, parallel_tool_calls: false, max_output_tokens: 800 }),
      });
      if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
      const { output } = outputSchema.parse(await response.json());
      input.push(...output);
      const calls = output.filter((item) => item.type === 'function_call');
      if (!calls.length) {
        const reply = output.flatMap((item) => item.type === 'message' ? item.content ?? [] : []).filter((part) => part.type === 'output_text').map((part) => part.text ?? '').join('\n').trim();
        if (!reply) throw new Error('Empty model reply');
        return { text: reply.slice(0, 4000), fromOpenAI: true, ...(serviceCards ? { serviceCards } : {}) };
      }
      for (const call of calls) {
        let result: unknown;
        try {
          const parsed = assistantToolSchema.parse({ name: call.name, arguments: JSON.parse(call.arguments ?? '{}') });
          if (parsed.name === 'create_booking' || parsed.name === 'cancel_booking' || parsed.name === 'reschedule_booking') {
            const pendingAction = { ...parsed, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
            await this.repository.saveConversation({ ...conversation, pendingAction });
            const action = parsed.name === 'create_booking' ? 'Новий запис' : parsed.name === 'cancel_booking' ? 'Скасування запису' : 'Перенесення запису';
            const details = Object.entries(parsed.arguments).map(([name, value]) => name === 'startAt' ? `Час: ${new Date(value).toLocaleString('uk-UA', { timeZone: process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv' })} (${process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv'})` : `${name === 'serviceId' ? 'Послуга' : 'Номер запису'}: ${value}`).join('\n');
            return localReply(`${action}\n${details}\nНадішліть /confirm для підтвердження або /cancel для відмови. Пропозиція діє 15 хвилин.`);
          }
          result = await this.assistantTools.execute(parsed, context);
          if (parsed.name === 'get_services') serviceCards = serviceSchema.array().parse(result);
        } catch {
          result = { error: 'Invalid request or unavailable data. Ask the client to clarify; do not invent a successful result.' };
        }
        input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) });
      }
    }
    return localReply(fallback);
  }
}
