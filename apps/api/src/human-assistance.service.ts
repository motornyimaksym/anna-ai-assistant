import { SystemOneSelector, systemOneDecisionInputSchema, systemOneProbabilitySchema } from './system-one.js';
import { DebugLogService, humanErrorContext, safeErrorDiagnostic } from './debug-log.service.js';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { humanReplySchema, type HumanRequestDto } from '@booking/contracts';
import { BookingRepository } from './repository.js';
import { HumanAssistanceStore, type Responder } from './human-assistance.store.js';
import { fetchWithLinearBackoff } from '@booking/http';

const TELEGRAM_MESSAGE_LIMIT = 4096;
type AnswerReplyMarkup = { inline_keyboard: Array<Array<{ text: string; copy_text: { text: string } }>> };
type DialogMessage = { role: 'user' | 'assistant'; content: string };
type NotificationTranscript = { messages: DialogMessage[]; username?: string; unsentMessage?: string; transferContext?: string };
type ClientContact = { username?: string; link?: string };

function truncateTelegramText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= 0) return '';
  const suffix = '…';
  let result = '';
  let used = 0;
  for (const character of text) {
    if (used + character.length > maxLength - suffix.length) break;
    result += character;
    used += character.length;
  }
  return `${result.trimEnd()}${suffix}`;
}

const escapeHtmlText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapedHtmlLength = (text: string) => escapeHtmlText(text).length;

function truncateHtmlText(text: string, maxEncodedLength: number): string {
  if (escapedHtmlLength(text) <= maxEncodedLength) return text;
  if (maxEncodedLength <= 0) return '';
  let result = '';
  let used = 0;
  for (const character of text) {
    const encodedLength = escapeHtmlText(character).length;
    if (used + encodedLength > maxEncodedLength - 1) break;
    result += character;
    used += encodedLength;
  }
  return `${result.trimEnd()}…`;
}

function readableTelegramDraft(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:b|i|code)>/gi, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function ensureCurrentMessage(messages: DialogMessage[], currentMessage: string): DialogMessage[] {
  const current = truncateTelegramText(currentMessage, 4000);
  const last = messages.at(-1);
  if (last?.role === 'user' && last.content === current) return messages.slice(-20);
  return [...messages.slice(-19), { role: 'user', content: current }];
}

function formatResponderNotification(transcript: NotificationTranscript, contact: ClientContact): string {
  const messages = [...transcript.messages];
  let unsentMessage = transcript.unsentMessage;
  let transferContext = transcript.transferContext;
  const username = [transcript.username, contact.username]
    .find((value): value is string => typeof value === 'string' && /^[a-zA-Z0-9_]{5,32}$/.test(value.replace(/^@/, '')))
    ?.replace(/^@/, '');
  const footer = `\n\nЧат клієнта:${contact.link ? ` ${contact.link}` : ''}`;
  const render = () => {
    const turns = messages.map(({ role, content }) => `${role === 'user' ? `${username ?? 'Клієнт'}` : 'Бот'}: ${escapeHtmlText(role === 'assistant' ? readableTelegramDraft(content) : content)}`).join('\n\n');
    let output = `<b>Діалог:</b>${turns ? `\n${turns}` : ''}`;
    if (unsentMessage) output += `\n\n<b>Не надіслане повідомлення:</b>\n${escapeHtmlText(unsentMessage)}`;
    if (transferContext) output += `\n\n<b>Контекст передачі:</b>\n${escapeHtmlText(transferContext)}`;
    return `${output}${footer}`;
  };

  let output = render();
  while (output.length > TELEGRAM_MESSAGE_LIMIT && messages.length > 1) {
    messages.shift();
    output = render();
  }
  for (const field of ['transferContext', 'unsentMessage', 'lastMessage'] as const) {
    while (output.length > TELEGRAM_MESSAGE_LIMIT) {
      const excess = output.length - TELEGRAM_MESSAGE_LIMIT;
      if (field === 'transferContext' && transferContext) {
        transferContext = truncateHtmlText(transferContext, Math.max(0, escapedHtmlLength(transferContext) - excess - 1));
        if (!transferContext) transferContext = undefined;
      } else if (field === 'unsentMessage' && unsentMessage) {
        unsentMessage = truncateHtmlText(unsentMessage, Math.max(0, escapedHtmlLength(unsentMessage) - excess - 1));
        if (!unsentMessage) unsentMessage = undefined;
      } else if (field === 'lastMessage' && messages.length) {
        const last = messages.at(-1)!;
        last.content = truncateHtmlText(last.content, Math.max(0, escapedHtmlLength(last.content) - excess - 1));
      } else break;
      output = render();
    }
  }
  return output;
}

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
    }, { clientMessage: question, unsentMessage: readableTelegramDraft(draft), transferContext: errorDetails });
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
    await this.escalate(chatId, businessConnectionId, updateId, `${question.slice(0, 2600)}${context ? `\n\nПричина передачі: ${context.slice(0, 1200)}` : ''}\n\nАвтоматичну обробку зупинено. Перевірте стан операції перед повторною спробою.`, { reason: 'operation_error', thresholdPercent: settings.thresholdPercent }, { clientMessage: question, transferContext: context });
  }

  async escalate(chatId: string, businessConnectionId: string | undefined, updateId: number, question: string, decision: { reason: HumanRequestDto['reason']; probability?: number; thresholdPercent: number }, display: { clientMessage?: string; unsentMessage?: string; transferContext?: string } = {}): Promise<void> {
    const { request, created } = await this.store.open(chatId, businessConnectionId, updateId, question, decision.reason, decision.probability, decision.thresholdPercent);
    if (!created) {
      await this.store.queue(request.id, question);
      await this.notify(request.id, await this.notificationTranscript(chatId, display.clientMessage ?? question, display), String(updateId), chatId);
      return;
    }
    await this.notify(request.id, await this.notificationTranscript(chatId, display.clientMessage ?? question, display), 'initial', chatId);
  }

  async queueExisting(requestId: string, text: string, updateId: number): Promise<void> {
    if (!await this.store.queue(requestId, text)) return;
    const request = await this.store.get(requestId);
    const chatId = request?.telegramChatId;
    const transcript = chatId ? await this.notificationTranscript(chatId, text) : { messages: [{ role: 'user' as const, content: text }] };
    await this.notify(requestId, transcript, String(updateId), chatId ?? 'unknown');
  }

  private async notificationTranscript(chatId: string, currentMessage: string, display: { unsentMessage?: string; transferContext?: string } = {}): Promise<NotificationTranscript> {
    const [history, conversation] = await Promise.all([this.repository.listMessages(chatId), this.repository.getConversation(chatId)]);
    return {
      messages: ensureCurrentMessage(history, currentMessage),
      ...(conversation?.telegramUsername ? { username: conversation.telegramUsername } : {}),
      ...(display.unsentMessage ? { unsentMessage: display.unsentMessage } : {}),
      ...(display.transferContext ? { transferContext: display.transferContext } : {}),
    };
  }

  private async notify(requestId: string, transcript: NotificationTranscript, eventId: string, chatId = 'unknown'): Promise<void> {
    const responders = await this.verifiedResponders();
    await this.debug.record({ telegramChatId: chatId }, 'handoff', { requestId, responderCount: responders.length, reason: responders.length ? 'notifying_responders' : 'no_connected_responders' }, responders.length ? 'info' : 'warn');
    if (!responders.length) return;
    const clientChatId = chatId === 'unknown' ? (await this.store.get(requestId))?.telegramChatId : chatId;
    const contact = clientChatId ? await this.clientContact(clientChatId) : {};
    const notification = formatResponderNotification(transcript, contact);
    const replyMarkup: AnswerReplyMarkup = { inline_keyboard: [[{ text: 'Копіювати /answer', copy_text: { text: `/answer ${requestId} ` } }]] };
    for (const responder of responders) await this.deliver(requestId, `${responder.userId}:${eventId}`, responder.chatId, undefined, notification, replyMarkup, 'HTML');
  }

  private async clientContact(chatId: string): Promise<ClientContact> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return {};
    try {
      const response = await fetchWithLinearBackoff(`https://api.telegram.org/bot${token}/getChat`, {
        method: 'POST', signal: AbortSignal.timeout(3_000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId }),
      }, { replaySafe: true });
      const result = await response.json() as { ok?: boolean; result?: { id?: number | string; type?: string; username?: string } };
      const username = result.result?.username;
      if (response.ok && result.ok === true && result.result?.type === 'private' && String(result.result.id) === chatId && typeof username === 'string' && /^[a-zA-Z0-9_]{5,32}$/.test(username)) return { username, link: `https://t.me/${username}` };
    } catch { /* A missing public link must never prevent human assistance. */ }
    return {};
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

  private async deliver(requestId: string, recipient: string, chatId: string, businessConnectionId: string | undefined, text: string, replyMarkup?: AnswerReplyMarkup, parseMode?: 'HTML'): Promise<void> {
    await this.store.setDelivery(requestId, recipient, 'sending');
    try {
      await this.send(chatId, businessConnectionId, text, replyMarkup, parseMode);
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
  async send(chatId: string, businessConnectionId: string | undefined, text: string, replyMarkup?: AnswerReplyMarkup, parseMode?: 'HTML'): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('Telegram token missing');
    const response = await fetchWithLinearBackoff(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, ...(parseMode ? { parse_mode: parseMode } : {}), ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}), ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
    }, { timeoutMs: 10_000 });
    const result = await response.json().catch(() => undefined) as { ok?: boolean } | undefined;
    if (!response.ok || result?.ok === false) throw Object.assign(new TelegramRejected(), { upstreamStatus: response.status, providerRequestId: response.headers?.get('x-request-id') ?? undefined });
    if (result?.ok !== true) throw new Error('Telegram delivery unconfirmed');
  }
}

class TelegramRejected extends Error { constructor() { super('Telegram rejected the message'); } }
