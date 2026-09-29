import { SystemOneSelector, systemOneDecisionInputSchema, systemOneProbabilitySchema } from './system-one.js';
import { DebugLogService, humanErrorContext, safeErrorDiagnostic } from './debug-log.service.js';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { humanReplySchema, type HumanRequestDto } from '@booking/contracts';
import { BookingRepository } from './repository.js';
import { HumanAssistanceStore, type Responder } from './human-assistance.store.js';
import { fetchWithLinearBackoff } from '@booking/http';

@Injectable()
export class HumanAssistanceService {
  private readonly logger = new Logger(HumanAssistanceService.name);
  constructor(private readonly store: HumanAssistanceStore, private readonly repository: BookingRepository, private readonly debug: DebugLogService, private readonly selector: SystemOneSelector) {}

  async approveOutgoing(chatId: string, businessConnectionId: string | undefined, updateId: number, question: string, draft: string): Promise<boolean> {
    const { thresholdPercent } = await this.store.settings();
    let probability: number | undefined;
    let errorDetails: string | undefined;
    try {
      const history = await this.repository.listMessages(chatId);
      const recent = history.at(-1)?.role === 'user' && history.at(-1)?.content === question ? history.slice(-20) : [...history.slice(-19), { role: 'user' as const, content: question }];
      const input = systemOneDecisionInputSchema.parse({
        question: 'How likely is the exact proposed reply to sound like a bot response in the latest conversation? Copied and pasted text may appear in natural replies.',
        context: JSON.stringify({ recent_messages: recent, proposed_reply: draft }),
      });
      probability = systemOneProbabilitySchema.parse(await this.selector.estimateProbability(input, AbortSignal.timeout(45_000)));
    } catch (error) {
      errorDetails = humanErrorContext(error, 'System One handoff', [question, draft]);
      this.logger.warn('Handoff assessment failed; withholding automatic reply');
    }
    if (probability !== undefined && probability < 1 && probability * 100 <= thresholdPercent) return true;
    const context = `Client question: ${question.slice(0, 1000)}\nUnsent draft: ${draft.slice(0, 2500)}${errorDetails ? `\n${errorDetails}` : ''}\nAutomatic reply withheld; inspect the conversation and Calendar before replying.`;
    await this.escalate(chatId, businessConnectionId, updateId, context, {
      reason: probability === undefined ? 'probability_unavailable' : 'handoff_probability',
      ...(probability === undefined ? {} : { probability }), thresholdPercent,
    });
    return false;
  }

  async settingsView() {
    const settings = await this.store.settings();
    const connected = new Set((await this.verifiedResponders(settings)).map((item) => item.username));
    return { thresholdPercent: settings.thresholdPercent, responders: settings.usernames.map((username) => ({ username, connected: connected.has(username) })), ...(settings.updatedAt ? { updatedAt: settings.updatedAt } : {}) };
  }
  async saveSettings(input: { thresholdPercent: number; usernames: string[] }) { return this.store.saveSettings(input); }

  async escalateError(chatId: string, businessConnectionId: string | undefined, updateId: number, question: string, context?: string) {
    const settings = await this.store.settings();
    await this.escalate(chatId, businessConnectionId, updateId, `${question.slice(0, 2800)}${context ? `\nAction context: ${context.slice(0, 900)}` : ''}\nAutomatic processing stopped; inspect bookings before retrying.`, { reason: 'operation_error', thresholdPercent: settings.thresholdPercent });
  }

  async escalate(chatId: string, businessConnectionId: string | undefined, updateId: number, question: string, decision: { reason: HumanRequestDto['reason']; probability?: number; thresholdPercent: number }): Promise<void> {
    const { request, created } = await this.store.open(chatId, businessConnectionId, updateId, question, decision.reason, decision.probability, decision.thresholdPercent);
    if (!created) {
      await this.store.queue(request.id, question);
      await this.notify(request.id, `Нове повідомлення щодо запиту ${request.id}:\n${question.slice(0, 3500)}`, String(updateId), chatId);
      return;
    }
    const history = await this.repository.listMessages(chatId);
    const context = history.slice(-3, -1).map(({ role, content }) => `${role}: ${content.slice(0, 350)}`).join('\n');
    await this.notify(request.id, `Потрібна відповідь людини. Запит ${request.id}:\n${question.slice(0, 3000)}${context ? `\nКонтекст:\n${context}` : ''}\nВідповісти: /answer ${request.id} <текст>`, 'initial', chatId);
  }

  async queueExisting(requestId: string, text: string, updateId: number): Promise<void> {
    if (await this.store.queue(requestId, text)) await this.notify(requestId, `Нове повідомлення щодо запиту ${requestId}:\n${text.slice(0, 3500)}`, String(updateId));
  }

  private async notify(requestId: string, text: string, eventId: string, chatId = 'unknown'): Promise<void> {
    const responders = await this.verifiedResponders();
    await this.debug.record({ telegramChatId: chatId }, 'handoff', { requestId, responderCount: responders.length, reason: responders.length ? 'notifying_responders' : 'no_connected_responders' }, responders.length ? 'info' : 'warn');
    if (!responders.length) return;
    const clientChatId = chatId === 'unknown' ? (await this.store.get(requestId))?.telegramChatId : chatId;
    const contact = clientChatId ? await this.clientContact(clientChatId) : '';
    const notification = `${text.slice(0, 3850)}${contact ? `\n${contact}` : ''}`;
    for (const responder of responders) await this.deliver(requestId, `${responder.userId}:${eventId}`, responder.chatId, undefined, notification);
  }

  private async clientContact(chatId: string): Promise<string> {
    const fallback = `Чат клієнта: ${chatId}`;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return fallback;
    try {
      const response = await fetchWithLinearBackoff(`https://api.telegram.org/bot${token}/getChat`, {
        method: 'POST', signal: AbortSignal.timeout(3_000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId }),
      }, { replaySafe: true });
      const result = await response.json() as { ok?: boolean; result?: { id?: number | string; type?: string; username?: string } };
      const username = result.result?.username;
      if (response.ok && result.ok === true && result.result?.type === 'private' && String(result.result.id) === chatId && typeof username === 'string' && /^[a-zA-Z0-9_]{5,32}$/.test(username)) return `${fallback}\nhttps://t.me/${username}`;
    } catch { /* A missing public link must never prevent human assistance. */ }
    return fallback;
  }

  private async verifiedResponders(settings?: { thresholdPercent: number; usernames: string[] }): Promise<Responder[]> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return [];
    const candidates = await this.store.connected(settings ?? await this.store.settings());
    const verified = await Promise.all(candidates.map(async (responder) => {
      try {
        const response = await fetchWithLinearBackoff(`https://api.telegram.org/bot${token}/getChat`, {
          method: 'POST', signal: AbortSignal.timeout(3_000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: responder.chatId }),
        }, { replaySafe: true });
        const result = await response.json() as { ok?: boolean; result?: { id?: number | string; username?: string; type?: string } };
        return response.ok && result.ok === true && result.result?.type === 'private' && String(result.result.id) === responder.chatId && result.result.username?.toLowerCase() === responder.username ? responder : undefined;
      } catch (error) { this.logger.error(`Telegram responder lookup failed: ${JSON.stringify(safeErrorDiagnostic(error, [responder.chatId, responder.username]))}`); return undefined; }
    }));
    return verified.filter((item): item is Responder => Boolean(item));
  }

  private async deliver(requestId: string, recipient: string, chatId: string, businessConnectionId: string | undefined, text: string): Promise<void> {
    await this.store.setDelivery(requestId, recipient, 'sending');
    try {
      await this.send(chatId, businessConnectionId, text);
      await this.store.setDelivery(requestId, recipient, 'sent');
    } catch (error) {
      await this.store.setDelivery(requestId, recipient, error instanceof TelegramRejected ? 'failed' : 'uncertain');
      this.logger.error(`Human-assistance Telegram delivery failed: ${JSON.stringify(safeErrorDiagnostic(error, [text]))}`);
    }
  }

  async enroll(userId: string, chatId: string, username: string): Promise<boolean> { return this.store.enroll(userId, chatId, username); }
  async isConfiguredUsername(username: string): Promise<boolean> { return this.store.isConfiguredUsername(username); }
  async authorizedResponder(userId: string, chatId: string, username: string): Promise<Responder | undefined> { return this.store.responder(userId, chatId, username); }
  async listOpen() { return this.store.listOpen(); }
  async reply(requestId: string, text: string, actor: string): Promise<HumanRequestDto> {
    text = humanReplySchema.parse({ text }).text;
    const request = await this.store.get(requestId);
    if (!request) throw new NotFoundException('Human request not found');
    const leaseId = await this.store.claimAnswer(requestId, actor);
    if (!leaseId) throw new ConflictException('Human request is no longer open');
    try {
      await this.send(request.telegramChatId, request.businessConnectionId, text);
    } catch (error) {
      await this.store.completeAnswer(requestId, leaseId, error instanceof TelegramRejected ? 'open' : 'uncertain');
      throw new ConflictException(error instanceof TelegramRejected ? 'Telegram rejected the reply; request remains open' : 'Telegram delivery uncertain; review request before retrying');
    }
    if (!await this.store.completeAnswer(requestId, leaseId, 'answered', text)) throw new ConflictException('Reply sent, but request state is uncertain; review before another send');
    try { await this.repository.appendMessage(request.conversationId, 'human', text); }
    catch { this.logger.warn('Human reply sent but conversation history save failed'); }
    return (await this.store.get(requestId))!;
  }
  async release(requestId: string, actor: string) {
    if (!await this.store.release(requestId, actor)) throw new ConflictException('Human request is no longer releasable');
    return { ok: true as const };
  }
  async send(chatId: string, businessConnectionId: string | undefined, text: string): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('Telegram token missing');
    const response = await fetchWithLinearBackoff(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}) }),
    }, { timeoutMs: 10_000 });
    const result = await response.json().catch(() => undefined) as { ok?: boolean } | undefined;
    if (!response.ok || result?.ok === false) throw Object.assign(new TelegramRejected(), { upstreamStatus: response.status, providerRequestId: response.headers?.get('x-request-id') ?? undefined });
    if (result?.ok !== true) throw new Error('Telegram delivery unconfirmed');
  }
}

class TelegramRejected extends Error { constructor() { super('Telegram rejected the message'); } }
