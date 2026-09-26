import 'reflect-metadata';
import { AdminGuard, AdminOwnerGuard } from '../src/auth.js';
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


it('protects source selection with owner access and validates refresh bodies', () => {
  expect(Reflect.getMetadata('__guards__', TelegramScheduleImportController)).toEqual([AdminGuard]);
  for (const method of ['sourceChats', 'selectSource'] as const) expect(Reflect.getMetadata('__guards__', TelegramScheduleImportController.prototype[method])).toEqual([AdminOwnerGuard]);
  const service = { selectSource: vi.fn(), refresh: vi.fn() };
  const controller = new TelegramScheduleImportController(service as never);
  expect(() => controller.selectSource({ chatId: '42', title: 'Spoofed' })).toThrow();
  expect(() => controller.refresh({ force: true })).toThrow();
  controller.selectSource({ chatId: '42' }); expect(service.selectSource).toHaveBeenCalledWith('42');
  controller.refresh({}); expect(service.refresh).toHaveBeenCalledOnce();
});
