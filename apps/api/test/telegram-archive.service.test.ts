import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramArchiveService, TELEGRAM_ARCHIVE_STORAGE_PATH } from '../src/telegram-archive.service.js';

const { getStorage } = vi.hoisted(() => ({ getStorage: vi.fn() }));
vi.mock('firebase-admin/storage', () => ({ getStorage }));

afterEach(() => vi.clearAllMocks());

describe('Telegram archive reference', () => {
  it('returns a short-lived Firebase URL and OpenAI vector store reference', async () => {
    const getSignedUrl = vi.fn(async () => ['https://storage.example/signed-result.json']);
    const file = vi.fn(() => ({ getSignedUrl }));
    getStorage.mockReturnValue({ bucket: () => ({ file }) });
    const repository = { getTelegramArchiveSettings: vi.fn(async () => ({ storagePath: TELEGRAM_ARCHIVE_STORAGE_PATH, openAiFileId: 'file-archive', vectorStoreId: 'vs-archive', sourceBytes: 100, updatedAt: '2026-10-06T10:00:00.000Z' })) };
    const service = new TelegramArchiveService(repository as never, {} as never);

    await expect(service.getPromptReference()).resolves.toEqual({ vectorStoreId: 'vs-archive', url: 'https://storage.example/signed-result.json' });
    expect(file).toHaveBeenCalledWith(TELEGRAM_ARCHIVE_STORAGE_PATH);
    expect(getSignedUrl).toHaveBeenCalledWith(expect.objectContaining({ action: 'read' }));
    const options = getSignedUrl.mock.calls[0]![0];
    expect(options.expires).toBeGreaterThan(Date.now());
    expect(options.expires).toBeLessThan(Date.now() + 16 * 60 * 1000);
  });

  it('fails closed when archive indexing metadata is missing', async () => {
    const service = new TelegramArchiveService({ getTelegramArchiveSettings: vi.fn(async () => undefined) } as never, {} as never);
    await expect(service.getPromptReference()).rejects.toThrow('Telegram archive is not configured');
    expect(getStorage).not.toHaveBeenCalled();
  });
});
