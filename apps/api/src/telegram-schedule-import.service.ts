import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { TelegramAccountService } from './telegram-account.service.js';
import { TelegramScheduleImportStore, type ScheduleSyncStatus, type ScheduleSyncClaim } from './telegram-schedule-import.store.js';

const manualRetryable = new Set<ScheduleSyncStatus>(['account_busy', 'connection_failed', 'timeout']);
const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

@Injectable()
export class TelegramScheduleImportService {
  private readonly logger = new Logger(TelegramScheduleImportService.name);
  constructor(private readonly store: TelegramScheduleImportStore, private readonly account: TelegramAccountService) {}
  private pause(milliseconds: number) { return wait(milliseconds); }

  async syncIfDue(): Promise<void> {
    try {
      const claim = await this.store.claimSync();
      if (claim.allowed && claim.attemptId) await this.runAttempt(claim);
    } catch {
      this.logger.warn('Telegram schedule import failed: connection_failed; message contents and credentials omitted');
    }
  }
  async refresh(retryTransient = false) {
    if (!retryTransient) {
      await this.syncIfDue();
      return this.readSnapshot();
    }
    const claim = await this.store.claimManualSync();
    if (!claim.allowed || !claim.attemptId || !claim.runId) return this.readSnapshot();
    try {
      let status = await this.runAttempt(claim);
      for (let attempt = 2; attempt <= 5 && manualRetryable.has(status); attempt++) {
        await this.pause((attempt - 1) * 10_000);
        const retry = await this.store.claimManualRetry(claim.runId);
        if (!retry.allowed || !retry.attemptId) break;
        status = await this.runAttempt(retry);
      }
    } finally {
      await this.store.finishManualRetryRun(claim.runId).catch(() => {});
    }
    return this.readSnapshot();
  }

  private async runAttempt(claim: ScheduleSyncClaim): Promise<ScheduleSyncStatus> {
    if (!claim.attemptId) return 'connection_failed';
    try {
      if (!await this.account.canReadSchedule()) {
        await this.store.complete(claim.attemptId, 'disconnected');
        return 'disconnected';
      }
      const result = await this.account.readScheduleMessages(claim.sourcePeerId, claim.sourceTopicId);
      if (!result) {
        await this.store.complete(claim.attemptId, 'source_not_found');
        return 'source_not_found';
      }
      await this.store.complete(claim.attemptId, 'success', { ...result, syncedAt: new Date().toISOString() });
      return 'success';
    } catch (error) {
      const code = (error as { errorMessage?: string })?.errorMessage ?? (error instanceof Error ? error.message : '');
      const status: ScheduleSyncStatus = error instanceof ConflictException ? 'account_busy' : code === 'TELEGRAM_TIMEOUT' ? 'timeout' : ['AUTH_KEY_UNREGISTERED', 'AUTH_KEY_INVALID', 'SESSION_REVOKED', 'SESSION_EXPIRED'].includes(code) ? 'disconnected' : 'connection_failed';
      await this.store.complete(claim.attemptId, status).catch(() => {});
      this.logger.warn(`Telegram schedule import failed: ${status}; message contents and credentials omitted`);
      return status;
    }
  }
  listSourceChats() { return this.account.listScheduleChats(); }
  listSourceTopics(chatId: string, q?: string) { return this.account.listScheduleTopics(chatId, q); }
  async selectSource(chatId: string, topicId?: number) {
    const { chats } = await this.account.listScheduleChats();
    const selected = chats.find((chat) => chat.id === chatId);
    if (!selected) throw new BadRequestException('Chat not found. Reload the chat list and select an accessible chat.');
    if (topicId !== undefined) {
      if (!selected.isForum) throw new BadRequestException('Select a forum group to choose a topic.');
      const { topics } = await this.account.listScheduleTopics(chatId, undefined, topicId);
      const topic = topics.find((candidate) => candidate.id === topicId);
      if (!topic) throw new BadRequestException('Topic not found. Reload topics and select an accessible topic.');
      await this.store.selectSource(selected.id, selected.title, topic);
    } else {
      await this.store.selectSource(selected.id, selected.title);
    }
    return this.readSnapshot();
  }
  readSnapshot() { return this.store.readSnapshot(); }
}
