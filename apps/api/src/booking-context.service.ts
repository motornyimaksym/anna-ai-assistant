import { Injectable } from '@nestjs/common';
import { CalendarService } from './calendar.js';
import { TelegramScheduleImportService } from './telegram-schedule-import.service.js';

/** Supplies scheduling evidence only. All dialogue and planning belong to the assistant. */
@Injectable()
export class BookingContextService {
  constructor(private readonly schedule: TelegramScheduleImportService, private readonly calendar: CalendarService) {}
  async read() {
    const now = Date.now();
    const rangeStart = new Date(now).toISOString();
    const rangeEnd = new Date(now + 30 * 24 * 60 * 60_000).toISOString();
    const [scheduleResult, calendarResult] = await Promise.allSettled([
      this.schedule.readSnapshot(), this.calendar.getBusyIntervals(rangeStart, rangeEnd),
    ]);
    if (scheduleResult.status === 'rejected') throw scheduleResult.reason;
    if (calendarResult.status === 'rejected') throw calendarResult.reason;
    const snapshot = scheduleResult.value;
    const age = snapshot?.syncedAt ? Date.now() - Date.parse(snapshot.syncedAt) : NaN;
    const ready = snapshot?.status === 'success' && Number.isFinite(age) && age >= 0 && age <= 300_000 && snapshot.slots.length > 0;
    return {
      timezone: process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv', currentTime: rangeStart,
      schedule: ready ? { status: 'ready' as const, syncedAt: snapshot!.syncedAt, messages: snapshot!.slots.slice(-5).map(({ text, createdAt }) => ({ text, createdAt })) } : { status: 'unavailable' as const },
      calendar: calendarResult.value.length <= 500
        ? { status: 'ready' as const, checkedAt: new Date().toISOString(), rangeStart, rangeEnd, busy: calendarResult.value }
        : { status: 'unavailable' as const },
    };
  }
}
