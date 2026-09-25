import { Injectable, Logger } from '@nestjs/common';
import { TelegramAccountService } from './telegram-account.service.js';
import { TelegramScheduleImportStore } from './telegram-schedule-import.store.js';

@Injectable()
export class TelegramScheduleImportService {
  private readonly logger = new Logger(TelegramScheduleImportService.name);
  constructor(private readonly store: TelegramScheduleImportStore, private readonly account: TelegramAccountService) {}

  async syncIfDue(): Promise<void> {
    try {
      if (!await this.account.canReadSchedule()) return;
      const claim = await this.store.claimSync();
      if (!claim.allowed) return;
      const result = await this.account.readScheduleMessages(claim.sourcePeerId);
      if (!result) return;
      await this.store.saveSnapshot({ ...result, syncedAt: new Date().toISOString() });
    } catch {
      this.logger.warn('Telegram schedule import failed; message contents and credentials omitted');
    }
  }

  readSnapshot() { return this.store.readSnapshot(); }
}
