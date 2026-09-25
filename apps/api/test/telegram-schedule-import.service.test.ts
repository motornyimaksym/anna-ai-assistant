import { describe, expect, it, vi } from 'vitest';
import { TelegramScheduleImportService } from '../src/telegram-schedule-import.service.js';

const fixture = () => {
  const store = { claimSync: vi.fn(async () => ({ allowed: true, sourcePeerId: '42' })), saveSnapshot: vi.fn(), readSnapshot: vi.fn(async () => ({ slots: [] })) };
  const account = {
    canReadSchedule: vi.fn(async () => true),
    readScheduleMessages: vi.fn(async () => ({
      sourcePeerId: '42', sourceChatTitle: 'Календар та планування часу',
      slots: [{ messageId: '17', text: 'Сьогодні 15:00', createdAt: '2026-09-25T09:30:00.000Z' }],
    })),
  };
  const service = new TelegramScheduleImportService(store as never, account as never);
  return { service, store, account };
};

describe('Telegram schedule import', () => {
  it('reads the previously bound chat and saves its latest slots', async () => {
    const { service, store, account } = fixture();
    await service.syncIfDue();
    expect(account.canReadSchedule).toHaveBeenCalledOnce();
    expect(store.claimSync).toHaveBeenCalledOnce();
    expect(account.readScheduleMessages).toHaveBeenCalledWith('42');
    expect(store.saveSnapshot).toHaveBeenCalledWith({
      sourcePeerId: '42', sourceChatTitle: 'Календар та планування часу',
      slots: [{ messageId: '17', text: 'Сьогодні 15:00', createdAt: '2026-09-25T09:30:00.000Z' }],
      syncedAt: expect.any(String),
    });
  });

  it('skips disconnected accounts and throttled attempts', async () => {
    const { service, store, account } = fixture();
    account.canReadSchedule.mockResolvedValueOnce(false);
    await service.syncIfDue();
    expect(store.claimSync).not.toHaveBeenCalled();
    store.claimSync.mockResolvedValueOnce({ allowed: false, sourcePeerId: '42' });
    await service.syncIfDue();
    expect(account.readScheduleMessages).not.toHaveBeenCalled();
  });

  it('does not fail incoming-message handling when import fails', async () => {
    const { service, account } = fixture();
    account.readScheduleMessages.mockRejectedValueOnce(new Error('private details must not be logged'));
    await expect(service.syncIfDue()).resolves.toBeUndefined();
  });
});
