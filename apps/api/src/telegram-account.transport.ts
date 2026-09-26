import type { TelegramScheduleChats, TelegramScheduleTopics } from '@booking/contracts';
import { Injectable } from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Logger, LogLevel } from 'telegram/extensions/Logger.js';
import { computeCheck } from 'telegram/Password.js';
import type { SessionPayload } from './telegram-account.store.js';
import { findScheduleDialog } from './telegram-schedule-source.js';

export type TelegramOperation = 'start' | 'code' | 'password' | 'check' | 'disconnect';
export type TransportResult = { session: string; phoneCodeHash?: string; passwordNeeded?: boolean; username?: string; phone?: string };
export type TelegramCredentials = { apiId: number; apiHash: string };
export type ScheduleMessage = { messageId: string; text: string; createdAt: string };
export type ScheduleHistoryResult = { session: string; sourcePeerId: string; sourceChatTitle: string; sourceTopicId?: number; sourceTopicTitle?: string; slots: ScheduleMessage[] };
const topicTitle = (topic: Api.ForumTopic) => (topic.title.trim() || `Telegram topic ${topic.id}`).slice(0, 255);
const displayTitle = (dialog: { title?: string; name?: string }, peerId: string): string =>
  (dialog.title?.trim() || dialog.name?.trim() || `Telegram chat ${peerId}`).slice(0, 255);
@Injectable()
export class TelegramAccountTransport {
  async listScheduleChats(credentials: TelegramCredentials, payload: SessionPayload): Promise<TelegramScheduleChats> {
    return this.withScheduleClient(credentials, payload, async (client) => {
      const dialogs = await client.getDialogs({ limit: 1000 });
      return { chats: dialogs.filter((dialog) => !!dialog.id).map((dialog) => ({
        id: dialog.id!.toString(), title: displayTitle(dialog, dialog.id!.toString()),
        ...(dialog.entity instanceof Api.Channel && dialog.entity.forum ? { isForum: true } : {}),
        kind: dialog.isGroup ? 'group' as const : dialog.isChannel ? 'channel' as const : 'private' as const,
      })), truncated: dialogs.length >= 1000 };
    });
  }

  async listScheduleTopics(credentials: TelegramCredentials, payload: SessionPayload, chatId: string, q?: string, topicId?: number): Promise<TelegramScheduleTopics> {
    return this.withScheduleClient(credentials, payload, async (client) => {
      const dialogs = await client.getDialogs({ limit: 1000 });
      const dialog = findScheduleDialog(dialogs, chatId);
      if (!dialog?.inputEntity || !(dialog.entity instanceof Api.Channel) || !dialog.entity.forum) return { topics: [], truncated: false };
      const result = topicId !== undefined
        ? await client.invoke(new Api.channels.GetForumTopicsByID({ channel: dialog.inputEntity, topics: [topicId] }))
        : await client.invoke(new Api.channels.GetForumTopics({ channel: dialog.inputEntity, q: q || undefined, offsetDate: 0, offsetId: 0, offsetTopic: 0, limit: 100 }));
      const topics = result.topics.filter((topic): topic is Api.ForumTopic => topic instanceof Api.ForumTopic)
        .filter((topic) => topicId === undefined || topic.id === topicId)
        .slice(0, 100).map((topic) => ({ id: topic.id, title: topicTitle(topic) }));
      return { topics, truncated: topicId === undefined && result.count > topics.length };
    });
  }

  private async generalHistory(client: TelegramClient, peer: Api.TypeInputPeer): Promise<Api.TypeMessage[]> {
    const history: Api.TypeMessage[] = [];
    let offsetId = 0;
    for (let page = 0; page < 10; page++) {
      const messages = await client.getMessages(peer, { limit: 100, offsetId });
      if (!messages.length) return history;
      for (const message of messages) {
        if (message instanceof Api.MessageEmpty) continue;
        const reply = message.replyTo;
        const topic = reply instanceof Api.MessageReplyHeader && reply.forumTopic ? (reply.replyToTopId ?? reply.replyToMsgId) : 1;
        const createsTopic = message.action instanceof Api.MessageActionTopicCreate;
        if (topic === 1 && !createsTopic) history.push(message);
        if (history.length === 5) return history;
      }
      const next = messages[messages.length - 1]!.id;
      if (next <= 0 || (offsetId && next >= offsetId)) throw new Error('TELEGRAM_HISTORY_LIMIT');
      offsetId = next;
      if (messages.length < 100) return history;
    }
    throw new Error('TELEGRAM_HISTORY_LIMIT');
  }

  private async withScheduleClient<T>(credentials: TelegramCredentials, payload: SessionPayload, operation: (client: TelegramClient, session: StringSession) => Promise<T>): Promise<T> {
    const session = new StringSession(payload.session);
    const client = new TelegramClient(session, credentials.apiId, credentials.apiHash, {
      connectionRetries: 1, requestRetries: 2, autoReconnect: false, floodSleepThreshold: 0,
      baseLogger: new Logger(LogLevel.NONE), deviceModel: 'Booking Admin', appVersion: '1.0',
    });
    client.onError = async () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    const pending = (async () => {
      await client.connect();
      if (expired) throw new Error('TELEGRAM_TIMEOUT');
      const result = await operation(client, session);
      if (expired) throw new Error('TELEGRAM_TIMEOUT');
      return result;
    })();
    void pending.finally(() => { if (expired) void client.destroy().catch(() => {}); }).catch(() => {});
    try {
      return await Promise.race([pending, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { expired = true; void client.destroy().catch(() => {}); reject(new Error('TELEGRAM_TIMEOUT')); }, 20_000);
      })]);
    } finally {
      clearTimeout(timer);
      if (!expired) await client.destroy().catch(() => {});
    }
  }

  async readScheduleMessages(credentials: TelegramCredentials, payload: SessionPayload, sourcePeerId?: string, sourceTopicId?: number): Promise<ScheduleHistoryResult | undefined> {
    return this.withScheduleClient(credentials, payload, async (client, session) => {
      const dialogs = await client.getDialogs({ limit: 1000 });
      const dialog = findScheduleDialog(dialogs, sourcePeerId);
      if (!dialog?.inputEntity || !dialog.id) return undefined;
      let topic: Api.ForumTopic | undefined;
      if (sourceTopicId !== undefined) {
        if (!sourcePeerId || !(dialog.entity instanceof Api.Channel) || !dialog.entity.forum) return undefined;
        try {
          const result = await client.invoke(new Api.channels.GetForumTopicsByID({ channel: dialog.inputEntity, topics: [sourceTopicId] }));
          topic = result.topics.find((candidate): candidate is Api.ForumTopic => candidate instanceof Api.ForumTopic && candidate.id === sourceTopicId);
          if (!topic) return undefined;
        } catch (error) {
          if (['TOPIC_DELETED', 'TOPIC_ID_INVALID', 'CHANNEL_PRIVATE', 'CHANNEL_INVALID'].includes((error as { errorMessage?: string }).errorMessage ?? '')) return undefined;
          throw error;
        }
      }
      const history = sourceTopicId === 1 ? await this.generalHistory(client, dialog.inputEntity)
        : await client.getMessages(dialog.inputEntity, { limit: 5, ...(sourceTopicId !== undefined ? { replyTo: sourceTopicId } : {}) });
      const slots = history
        .filter((message): message is Api.Message => message instanceof Api.Message && !!message.message?.trim())
        .map((message) => ({ messageId: String(message.id), text: message.message.slice(0, 4_000), createdAt: new Date(message.date * 1000).toISOString() }))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      return { session: session.save(), sourcePeerId: dialog.id.toString(), sourceChatTitle: displayTitle(dialog, dialog.id.toString()), ...(topic ? { sourceTopicId: topic.id, sourceTopicTitle: topicTitle(topic) } : {}), slots };
    });
  }

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
