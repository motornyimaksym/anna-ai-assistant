import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingContextService } from '../src/booking-context.service.js';
import type { TelegramScheduleImportService } from '../src/telegram-schedule-import.service.js';
import type { CalendarService } from '../src/calendar.js';
const schedule = { readSnapshot: vi.fn() };
const calendar = { getBusyIntervals: vi.fn() };
const service = new BookingContextService(schedule as unknown as TelegramScheduleImportService, calendar as unknown as CalendarService);
beforeEach(() => { vi.resetAllMocks(); calendar.getBusyIntervals.mockResolvedValue([]); });
describe('read-only booking evidence', () => {
  it('returns fresh raw schedule and live Calendar evidence without client wording', async () => {
    schedule.readSnapshot.mockResolvedValue({ status: 'success', syncedAt: new Date().toISOString(), slots: [{ text: 'Tomorrow 10:00', createdAt: new Date().toISOString() }] });
    const result = await service.read();
    expect(result.schedule.status).toBe('ready');
    expect(result.calendar.status).toBe('ready');
    expect(result).not.toHaveProperty('reply');
    expect(result).not.toHaveProperty('question');
  });
  it('marks stale schedule and failed Calendar unavailable', async () => {
    schedule.readSnapshot.mockResolvedValue({ status: 'success', syncedAt: new Date(Date.now() - 301_000).toISOString(), slots: [{ text: '10:00' }] });
    calendar.getBusyIntervals.mockRejectedValue(new Error('offline'));
    expect(await service.read()).toMatchObject({ schedule: { status: 'unavailable' }, calendar: { status: 'unavailable' } });
  });
});
