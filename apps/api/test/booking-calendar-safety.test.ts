import { describe, expect, it, vi } from 'vitest';
import { CalendarService, bookingEventId } from '../src/calendar.js';
import type { BookingDto } from '@booking/contracts';
const booking = { id: 'booking', googleCalendarId: 'appointments', googleCalendarEventId: bookingEventId('booking'), startAt: '2099-01-01T08:00:00Z', endAt: '2099-01-01T09:00:00Z' } as BookingDto;
describe('Calendar safety', () => {
  it('unions selected conflict calendars and rejects disconnection', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ calendars: { appointments: { busy: [] }, personal: { busy: [{ start: booking.startAt, end: booking.endAt }] } } })));
    const credentials = vi.fn(async () => ({ calendarId: 'appointments', conflictCalendarIds: ['personal'], refreshToken: 'x' }));
    const service = new CalendarService({ credentials, request } as never);
    expect(await service.getBusyIntervals(booking.startAt, booking.endAt)).toHaveLength(1);
    credentials.mockResolvedValueOnce(undefined as never);
    await expect(service.getBusyIntervals(booking.startAt, booking.endAt)).rejects.toThrow();
  });
  it('recovers duplicate inserts only when ownership and timing match', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response('', { status: 409 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: booking.googleCalendarEventId, start: { dateTime: booking.startAt }, end: { dateTime: booking.endAt }, extendedProperties: { private: { bookingId: booking.id } } })));
    const service = new CalendarService({ credentials: async () => ({ refreshToken: 'x', calendarId: 'different' }), request } as never);
    expect(await service.createBookingEvent(booking)).toEqual({ eventId: booking.googleCalendarEventId, calendarId: 'appointments' });
    expect(request.mock.calls[0]![1]).toContain('/appointments/');
  });
});
