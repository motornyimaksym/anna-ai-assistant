import { describe, expect, it, vi } from 'vitest';
import { TelegramScheduleImportController } from '../src/telegram-schedule-import.controller.js';

describe('read-only schedule import API', () => {
  it('returns the stored snapshot through a read-only handler', async () => {
    const snapshot = { slots: [] };
    const scheduleImport = { readSnapshot: vi.fn(async () => snapshot) };
    const controller = new TelegramScheduleImportController(scheduleImport as never);
    await expect(controller.importedSlots()).resolves.toBe(snapshot);
    expect(scheduleImport.readSnapshot).toHaveBeenCalledOnce();
  });
});
