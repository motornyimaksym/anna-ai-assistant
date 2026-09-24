import { DateTime, Interval } from 'luxon';
import type { AvailabilityRuleDto, ScheduleExceptionDto, ServiceDto } from '@booking/contracts';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type TimeInterval = { start: string; end: string };
export class BookingConflictError extends Error { constructor() { super('The requested appointment time is no longer available'); } }
export class BookingNotFoundError extends Error { constructor() { super('Booking not found'); } }
export class ServiceNotFoundError extends Error { constructor() { super('Service not found'); } }
export class InvalidScheduleError extends Error { constructor(message: string) { super(message); } }
export class CalendarSyncError extends Error { constructor() { super('Calendar synchronization failed'); } }
export class UnauthorizedError extends Error { constructor() { super('Unauthorized'); } }

const parseLocal = (date: string, time: string, zone: string): DateTime => DateTime.fromISO(`${date}T${time}`, { zone });
const overlaps = (candidate: Interval, interval: TimeInterval): boolean => candidate.overlaps(Interval.fromDateTimes(DateTime.fromISO(interval.start), DateTime.fromISO(interval.end)));
export const lockedSlotKeys = (resourceId: string, startAt: string, endAt: string, bufferMinutes: number, zone = 'Europe/Kyiv'): string[] => {
  const end = DateTime.fromISO(endAt).plus({ minutes: bufferMinutes }); let cursor = DateTime.fromISO(startAt).setZone(zone).startOf('minute'); const result: string[] = [];
  while (cursor < end) { result.push(`${resourceId}_${cursor.toFormat('yyyy-LL-dd_HH-mm')}`); cursor = cursor.plus({ minutes: 15 }); }
  return result;
};
export const serviceEndAt = (startAt: string, service: Pick<ServiceDto, 'durationMinutes'>): string => DateTime.fromISO(startAt).plus({ minutes: service.durationMinutes }).toUTC().toISO({ suppressMilliseconds: true })!;
export const generateAvailableSlots = (input: { date: string; timezone: string; service: Pick<ServiceDto, 'durationMinutes' | 'bufferMinutes'>; rules: AvailabilityRuleDto[]; exceptions: ScheduleExceptionDto[]; occupied: TimeInterval[]; busy: TimeInterval[]; after?: string; before?: string }): string[] => {
  const { date, timezone, service } = input; const day = parseLocal(date, '00:00', timezone); if (!day.isValid) throw new InvalidScheduleError('Invalid date');
  const exceptions = input.exceptions.filter((item) => item.date === date); if (exceptions.some((item) => item.type === 'day_off')) return [];
  let windows = input.rules.filter((rule) => rule.enabled && rule.dayOfWeek === day.weekday % 7).map((rule) => ({ start: rule.start, end: rule.end }));
  const special = exceptions.filter((item) => item.type === 'working_interval'); if (special.length) windows = special.map((item) => ({ start: item.start!, end: item.end! }));
  const blocked = exceptions.filter((item) => item.type === 'blocked_interval').map((item) => ({ start: parseLocal(date, item.start!, timezone).toUTC().toISO()!, end: parseLocal(date, item.end!, timezone).toUTC().toISO()! }));
  const unavailable = [...input.occupied, ...input.busy, ...blocked]; const slots: string[] = [];
  for (const window of windows) { let cursor = parseLocal(date, window.start, timezone); const latest = parseLocal(date, window.end, timezone).minus({ minutes: service.durationMinutes + service.bufferMinutes });
    if (input.after && cursor < parseLocal(date, input.after, timezone)) cursor = parseLocal(date, input.after, timezone);
    while (cursor <= latest) { const start = cursor.toUTC().toISO()!; const end = cursor.plus({ minutes: service.durationMinutes + service.bufferMinutes }).toUTC().toISO()!; if ((!input.before || cursor < parseLocal(date, input.before, timezone)) && !unavailable.some((interval) => overlaps(Interval.fromDateTimes(DateTime.fromISO(start), DateTime.fromISO(end)), interval))) slots.push(start); cursor = cursor.plus({ minutes: 15 }); }
  }
  return slots;
};

