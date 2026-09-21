import { describe, expect, it } from 'vitest';
import { generateAvailableSlots, lockedSlotKeys } from '../src/index.js';
import type { ServiceDto } from '@booking/contracts';
const service: ServiceDto = { id: 'massage-60', name: 'Massage', description: '', durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH', enabled: true };
const rules = [{ id: 'mon', dayOfWeek: 1, start: '10:00', end: '12:00', enabled: true }];
describe('availability', () => {
  it('reserves buffer and closing boundary', () => expect(generateAvailableSlots({ date: '2026-09-21', timezone: 'Europe/Kyiv', service, rules, exceptions: [], occupied: [], busy: [] })).toHaveLength(4));
  it('excludes booked intervals and schedule exceptions', () => expect(generateAvailableSlots({ date: '2026-09-21', timezone: 'Europe/Kyiv', service, rules, exceptions: [{ id: 'off', date: '2026-09-21', type: 'day_off' }], occupied: [], busy: [] })).toEqual([]));
  it('creates 15-minute locks including post-booking buffer', () => expect(lockedSlotKeys('default', '2026-09-21T07:00:00.000Z', '2026-09-21T08:00:00.000Z', 15)).toHaveLength(5));
});
