import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { TelegramAccountService } from './telegram-account.service.js';
import { TelegramScheduleImportStore, type ScheduleSyncStatus } from './telegram-schedule-import.store.js';

@Injectable()
export class TelegramScheduleImportService {
  private readonly logger = new Logger(TelegramScheduleImportService.name);
  constructor(private readonly store: TelegramScheduleImportStore, private readonly account: TelegramAccountService) {}

  async syncIfDue(): Promise<void> {
    let attemptId: string | undefined;
    try {
      const claim = await this.store.claimSync();
      if (!claim.allowed || !claim.attemptId) return;
      attemptId = claim.attemptId;
      if (!await this.account.canReadSchedule()) { await this.store.complete(attemptId, 'disconnected'); return; }
      const result = await this.account.readScheduleMessages(claim.sourcePeerId);
      if (!result) { await this.store.complete(attemptId, 'source_not_found'); return; }
      await this.store.complete(attemptId, 'success', { ...result, syncedAt: new Date().toISOString() });
    } catch (error) {
      const code = (error as { errorMessage?: string })?.errorMessage ?? (error instanceof Error ? error.message : '');
      const status: ScheduleSyncStatus = error instanceof ConflictException ? 'account_busy' : code === 'TELEGRAM_TIMEOUT' ? 'timeout' : ['AUTH_KEY_UNREGISTERED', 'AUTH_KEY_INVALID', 'SESSION_REVOKED', 'SESSION_EXPIRED'].includes(code) ? 'disconnected' : 'connection_failed';
      if (attemptId) await this.store.complete(attemptId, status).catch(() => {});
      this.logger.warn(`Telegram schedule import failed: ${status}; message contents and credentials omitted`);
    }
  }
  async refresh() { await this.syncIfDue(); return this.readSnapshot(); }
  listSourceChats() { return this.account.listScheduleChats(); }
  async selectSource(chatId: string) {
    const { chats } = await this.account.listScheduleChats();
    const selected = chats.find((chat) => chat.id === chatId);
    if (!selected) throw new BadRequestException('Chat not found. Reload the chat list and select an accessible chat.');
    await this.store.selectSource(selected.id, selected.title);
    return this.readSnapshot();
  }
  readSnapshot() { return this.store.readSnapshot(); }
}
