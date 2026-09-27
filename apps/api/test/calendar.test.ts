import { describe, expect, it, vi } from 'vitest';
import { CalendarService, bookingEventId } from '../src/calendar.js';
import type { BookingDto } from '@booking/contracts';
function fixture() {
  const connection = { credentials: vi.fn(async () => ({ refreshToken: 'secret', calendarId: 'new-calendar' })), request: vi.fn() };
  return { connection, service: new CalendarService(connection as never) };
}
const booking = { id: 'booking', serviceId: 'massage', clientId: 'client', telegramChatId: '1', googleCalendarEventId: bookingEventId('booking'), googleCalendarId: 'old-calendar', startAt: '2099-01-01T10:00:00Z', endAt: '2099-01-01T11:00:00Z' } as BookingDto;
const event = { id: booking.googleCalendarEventId, etag: 'version-1', start: { dateTime: booking.startAt }, end: { dateTime: booking.endAt }, extendedProperties: { private: { bookingId: booking.id } } };
const reply = (body: unknown) => new Response(JSON.stringify(body));
describe('dynamic Calendar booking integration', () => {
  it('does not treat FreeBusy errors or disconnection as free time', async () => {
    const { service, connection } = fixture();
    for (const result of [{ calendars: {} }, { calendars: { 'new-calendar': { errors: [{ reason: 'notFound' }], busy: [] } } }]) {
      connection.request.mockResolvedValueOnce(reply(result));
      await expect(service.getBusyIntervals(booking.startAt, booking.endAt)).rejects.toThrow();
    }
    connection.credentials.mockResolvedValueOnce(undefined as never);
    await expect(service.getBusyIntervals(booking.startAt, booking.endAt)).rejects.toThrow();
  });
  it('keeps mutations bound to original calendar and uses optimistic event version', async () => {
    const { service, connection } = fixture();
    const moved = { ...booking, startAt: '2099-01-02T10:00:00Z', endAt: '2099-01-02T11:00:00Z' };
    connection.request.mockResolvedValueOnce(reply(event)).mockResolvedValueOnce(reply({ ...event, start: { dateTime: moved.startAt }, end: { dateTime: moved.endAt } }));
    await service.updateBookingEvent(moved, booking);
    expect(connection.request.mock.calls[1]![1]).toContain('/calendars/old-calendar/events/');
    expect(connection.request.mock.calls[1]![2]).toMatchObject({ method: 'PATCH', headers: { 'If-Match': 'version-1' } });
    connection.request.mockResolvedValueOnce(reply(event)).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await service.deleteBookingEvent(booking.googleCalendarEventId!, 'old-calendar', booking);
    expect(connection.request.mock.calls[3]![1]).toContain('/calendars/old-calendar/events/');
    await expect(service.updateBookingEvent({ ...booking, googleCalendarEventId: undefined })).rejects.toThrow();
  });
  it('persists a deterministic owned event and rejects mismatched responses', async () => {
    const { service, connection } = fixture(); connection.request.mockResolvedValueOnce(reply(event));
    expect(await service.createBookingEvent(booking)).toEqual({ eventId: booking.googleCalendarEventId, calendarId: 'old-calendar' });
    connection.request.mockResolvedValueOnce(reply({ ...event, extendedProperties: { private: { bookingId: 'other' } } }));
    await expect(service.createBookingEvent(booking)).rejects.toThrow('ownership');
  });
  it('excludes only own event, preserving overlapping personal and all-day events', async () => {
    const { service, connection } = fixture();
    connection.request.mockResolvedValueOnce(reply({ calendars: { 'new-calendar': { busy: [] } } })).mockResolvedValueOnce(reply({ timeZone: 'Europe/Kyiv', items: [event, { ...event, id: 'personal', extendedProperties: undefined }, { id: 'allday', start: { date: '2099-01-01' }, end: { date: '2099-01-02' } }, { id: 'free', transparency: 'transparent' }, { id: 'cancelled', status: 'cancelled' }] }));
    const busy = await service.getBusyIntervals(booking.startAt, booking.endAt, booking);
    expect(busy).toEqual([{ start: booking.startAt, end: booking.endAt }, { start: '2098-12-31T22:00:00.000Z', end: '2099-01-01T22:00:00.000Z' }]);
    expect(connection.request.mock.calls[1]![1]).toContain('singleEvents=true');
  });
  it('refuses to overwrite externally moved events', async () => {
    const { service, connection } = fixture();
    connection.request.mockResolvedValueOnce(reply({ ...event, start: { dateTime: '2099-02-01T10:00:00Z' } }));
    await expect(service.updateBookingEvent({ ...booking, startAt: '2099-01-02T10:00:00Z' }, booking)).rejects.toThrow('changed');
    expect(connection.request).toHaveBeenCalledTimes(1);
  });
});

it('does not interpret lost calendar access as a deleted appointment', async () => {
  const { service, connection } = fixture();
  connection.request.mockResolvedValueOnce(new Response(null, { status: 404 })).mockRejectedValueOnce(new Error('Calendar access lost'));
  await expect(service.deleteBookingEvent(booking.googleCalendarEventId!, booking.googleCalendarId, booking)).rejects.toThrow('access lost');
  expect(connection.request.mock.calls.some((call) => call[2]?.method === 'DELETE')).toBe(false);
});

it('accepts verified absence on a still-writable calendar for idempotent cancellation', async () => {
  const { service, connection } = fixture();
  connection.request.mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(reply({ accessRole: 'owner' }));
  await expect(service.deleteBookingEvent(booking.googleCalendarEventId!, booking.googleCalendarId, booking)).resolves.toBeUndefined();
});
