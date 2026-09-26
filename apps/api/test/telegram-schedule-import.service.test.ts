import { describe, expect, it, vi } from 'vitest';
import { TelegramScheduleImportService } from '../src/telegram-schedule-import.service.js';

const fixture = () => {
  const store = { claimSync: vi.fn(async () => ({ allowed: true, sourcePeerId: '42', attemptId: 'claim' })), complete: vi.fn(async () => {}), readSnapshot: vi.fn(async () => ({ slots: [] })) };
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
    expect(store.complete).toHaveBeenCalledWith('claim', 'success', {
      sourcePeerId: '42', sourceChatTitle: 'Календар та планування часу',
      slots: [{ messageId: '17', text: 'Сьогодні 15:00', createdAt: '2026-09-25T09:30:00.000Z' }],
      syncedAt: expect.any(String),
    });
  });

  it('skips disconnected accounts and throttled attempts', async () => {
    const { service, store, account } = fixture();
    account.canReadSchedule.mockResolvedValueOnce(false);
    await service.syncIfDue();
    expect(store.complete).toHaveBeenCalledWith('claim', 'disconnected');
    store.claimSync.mockResolvedValueOnce({ allowed: false, sourcePeerId: '42', attemptId: 'claim' });
    await service.syncIfDue();
    expect(account.readScheduleMessages).not.toHaveBeenCalled();
  });

  it('does not fail incoming-message handling when import fails', async () => {
    const { service, account } = fixture();
    account.readScheduleMessages.mockRejectedValueOnce(new Error('private details must not be logged'));
    await expect(service.syncIfDue()).resolves.toBeUndefined();
  });
});


it('records missing-chat diagnostics rather than silently skipping', async () => {
  const { service, store, account } = fixture();
  account.readScheduleMessages.mockResolvedValueOnce(undefined as never);
  await service.syncIfDue();
  expect(store.complete).toHaveBeenCalledWith('claim', 'source_not_found');
});

it('records safe busy/timeout failures', async () => {
  const { ConflictException } = await import('@nestjs/common');
  const { service, store, account } = fixture();
  account.readScheduleMessages.mockRejectedValueOnce(new ConflictException('private context'));
  await service.syncIfDue();
  expect(store.complete).toHaveBeenLastCalledWith('claim', 'account_busy');
  account.readScheduleMessages.mockRejectedValueOnce(new Error('TELEGRAM_TIMEOUT'));
  await service.syncIfDue();
  expect(store.complete).toHaveBeenLastCalledWith('claim', 'timeout');
});

it('verifies source ID against Telegram and saves only the server-provided title', async () => {
  const store = { selectSource: vi.fn(), readSnapshot: vi.fn() };
  const account = { listScheduleChats: vi.fn(async () => ({ chats: [{ id: '99', title: 'Private schedule', kind: 'private' }], truncated: false })) };
  const service = new TelegramScheduleImportService(store as never, account as never);
  await expect(service.selectSource('42')).rejects.toThrow('Chat not found');
  expect(store.selectSource).not.toHaveBeenCalled();
  await service.selectSource('99');
  expect(store.selectSource).toHaveBeenCalledWith('99', 'Private schedule');
});
