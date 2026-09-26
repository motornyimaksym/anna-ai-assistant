import { describe, expect, it, vi } from 'vitest';
import { TelegramScheduleImportService } from '../src/telegram-schedule-import.service.js';

const fixture = () => {
  const store = { claimSync: vi.fn(async () => ({ allowed: true, sourcePeerId: '42', attemptId: 'claim' })), claimManualSync: vi.fn(async () => ({ allowed: true, sourcePeerId: '42', attemptId: 'manual-1', runId: 'run' })), claimManualRetry: vi.fn(async () => ({ allowed: true, sourcePeerId: '42', attemptId: 'retry' })), finishManualRetryRun: vi.fn(async () => {}), complete: vi.fn(async () => {}), readSnapshot: vi.fn(async () => ({ slots: [] })) };
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
    expect(account.readScheduleMessages).toHaveBeenCalledWith('42', undefined);
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

  it('does not fail incoming-message handling when the sync claim fails', async () => {
    const { service, store } = fixture();
    store.claimSync.mockRejectedValueOnce(new Error('private storage details'));
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

it('validates topic against its parent and persists the verified title', async () => {
  const store = { selectSource: vi.fn(), readSnapshot: vi.fn() };
  const account = { listScheduleChats: vi.fn(async () => ({ chats: [{ id: '-10042', title: 'Forum', isForum: true }] })), listScheduleTopics: vi.fn(async () => ({ topics: [{ id: 42, title: 'Verified' }] })) };
  const service = new TelegramScheduleImportService(store as never, account as never);
  await service.selectSource('-10042', 42);
  expect(account.listScheduleTopics).toHaveBeenCalledWith('-10042', undefined, 42);
  expect(store.selectSource).toHaveBeenCalledWith('-10042', 'Forum', { id: 42, title: 'Verified' });
  store.selectSource.mockClear();
  await expect(service.selectSource('-10042', 99)).rejects.toThrow('Topic not found');
  account.listScheduleChats.mockResolvedValue({ chats: [{ id: '-10042', title: 'Forum', isForum: false }] });
  await expect(service.selectSource('-10042', 42)).rejects.toThrow('Select a forum');
  expect(store.selectSource).not.toHaveBeenCalled();
});

it('passes the claimed topic to history reads', async () => {
  const { service, store, account } = fixture();
  store.claimSync.mockResolvedValue({ allowed: true, sourcePeerId: '42', sourceTopicId: 17, attemptId: 'claim' } as never);
  await service.syncIfDue();
  expect(account.readScheduleMessages).toHaveBeenCalledWith('42', 17);
});


describe('manual schedule refresh retries', () => {
  it('bypasses prior failure cooldown and retries transient failures with linear backoff, at most five times', async () => {
    const { service, store, account } = fixture();
    store.claimManualRetry.mockImplementation(async () => {
      const attemptId = `attempt-${store.claimManualRetry.mock.calls.length + 1}`;
      return { allowed: true, sourcePeerId: '42', attemptId };
    });
    account.readScheduleMessages
      .mockRejectedValueOnce(new Error('temporary network issue'))
      .mockRejectedValueOnce(new Error('TELEGRAM_TIMEOUT'))
      .mockRejectedValueOnce(new (await import('@nestjs/common')).ConflictException('busy'))
      .mockResolvedValueOnce({ sourcePeerId: '42', sourceChatTitle: 'Calendar', slots: [] });
    const pause = vi.spyOn(service as unknown as { pause: (milliseconds: number) => Promise<void> }, 'pause').mockResolvedValue();
    await service.refresh(true);
    expect(store.claimManualSync).toHaveBeenCalledOnce();
    expect(store.claimManualRetry).toHaveBeenCalledTimes(3);
    expect(pause.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([10_000, 20_000, 30_000]);
    expect(account.readScheduleMessages).toHaveBeenCalledTimes(4);
    expect(store.complete.mock.calls.map(([, status]) => status)).toEqual(['connection_failed', 'timeout', 'account_busy', 'success']);
    expect(store.finishManualRetryRun).toHaveBeenCalledWith('run');
  });

  it('stops manual retries on missing source or disconnected account', async () => {
    const { service, store, account } = fixture();
    const pause = vi.spyOn(service as unknown as { pause: (milliseconds: number) => Promise<void> }, 'pause').mockResolvedValue();
    account.readScheduleMessages.mockResolvedValueOnce(undefined as never);
    await service.refresh(true);
    expect(store.complete).toHaveBeenLastCalledWith('manual-1', 'source_not_found');
    expect(store.claimManualRetry).not.toHaveBeenCalled();
    account.canReadSchedule.mockResolvedValueOnce(false);
    await service.refresh(true);
    expect(store.complete).toHaveBeenLastCalledWith('manual-1', 'disconnected');
    expect(store.claimManualRetry).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });
});
