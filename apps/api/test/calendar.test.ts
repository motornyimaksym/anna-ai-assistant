import { describe, expect, it, vi } from 'vitest';
import { CalendarService } from '../src/calendar.js';
import type { BookingDto } from '@booking/contracts';
function fixture() {
  const connection = { credentials: vi.fn(async () => ({ refreshToken: 'secret', calendarId: 'new-calendar' })), request: vi.fn() };
  return { connection, service: new CalendarService(connection as never) };
}
describe('dynamic Calendar booking integration', () => {
  it('does not treat a FreeBusy error or missing calendar as free time', async () => {
    const { service, connection } = fixture();
    for (const result of [{ calendars: {} }, { calendars: { 'new-calendar': { errors: [{ reason: 'notFound' }], busy: [] } } }]) {
      connection.request.mockResolvedValueOnce(new Response(JSON.stringify(result)));
      await expect(service.getBusyIntervals('2026-09-25T10:00:00Z', '2026-09-25T11:00:00Z')).rejects.toThrow();
    }
    connection.credentials.mockResolvedValueOnce(undefined as never);
    expect(await service.getBusyIntervals('start', 'end')).toEqual([]);
  });
  it('keeps event mutations bound to the original calendar after selection changes', async () => {
    const { service, connection } = fixture(); connection.request.mockResolvedValue(new Response('{}'));
    const booking = { googleCalendarEventId: 'event', googleCalendarId: 'old-calendar', startAt: '2026-09-25T10:00:00Z', endAt: '2026-09-25T11:00:00Z' } as BookingDto;
    await service.updateBookingEvent(booking);
    expect(connection.request.mock.calls[0]![1]).toBe('/calendars/old-calendar/events/event');
    await service.deleteBookingEvent('event', 'old-calendar');
    expect(connection.request.mock.calls[1]![1]).toBe('/calendars/old-calendar/events/event');
    await expect(service.updateBookingEvent({ ...booking, googleCalendarEventId: undefined })).rejects.toThrow();
  });
  it('returns the actual destination with a created event ID for persistence', async () => {
    const { service, connection } = fixture(); connection.request.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'event' })));
    expect(await service.createBookingEvent({ id: 'booking', serviceId: 'massage', telegramChatId: '1', startAt: 'start', endAt: 'end' } as BookingDto)).toEqual({ eventId: 'event', calendarId: 'new-calendar' });
  });
});
