import { Injectable } from '@nestjs/common';
import { getStorage } from 'firebase-admin/storage';
import { BookingRepository } from './repository.js';
import { FirebaseAdminService } from './firebase-admin.js';

export const TELEGRAM_ARCHIVE_STORAGE_PATH = 'assistant-data/telegram-export/result.json';
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class TelegramArchiveService {
  constructor(private readonly repository: BookingRepository, _firebase: FirebaseAdminService) {}

  async getPromptReference(): Promise<{ vectorStoreId: string; url: string }> {
    const archive = await this.repository.getTelegramArchiveSettings();
    if (!archive || archive.storagePath !== TELEGRAM_ARCHIVE_STORAGE_PATH) throw new Error('Telegram archive is not configured');
    const [url] = await getStorage().bucket().file(archive.storagePath).getSignedUrl({ action: 'read', expires: Date.now() + SIGNED_URL_TTL_MS });
    return { vectorStoreId: archive.vectorStoreId, url };
  }
}
