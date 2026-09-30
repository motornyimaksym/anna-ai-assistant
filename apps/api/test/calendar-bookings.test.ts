import { describe, expect, it, vi } from 'vitest';
import { CalendarService, bookingEventId } from '../src/calendar.js';

describe('Calendar-only booking records', () => {
  it('creates complete private metadata and readable description', async () => {
    const requests: Array<{ path: string; body?: unknown }> = [];
    const connection = {
      credentials: vi.fn(async () => ({ refreshToken: 'test', calendarId: 'calendar@example.com' })),
      request: vi.fn(async (_credentials: unknown, path: string, init: RequestInit = {}) => {
        const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
        requests.push({ path, body });
        return { status: 200, json: async () => ({ ...(body ?? {}), etag: 'v1' }) };
      }),
    };
    const calendar = new CalendarService(connection as never);
    const booking = { id: 'booking-1', clientId: 'client-1', telegramChatId: 'chat-1', serviceId: 'massage', durationMinutes: 90, price: 4000, currency: 'UAH', startAt: '2099-01-01T09:00:00.000Z', endAt: '2099-01-01T10:30:00.000Z', status: 'confirmed' as const, calendarSyncStatus: 'synced' as const, createdAt: '2098-01-01T00:00:00.000Z', updatedAt: '2098-01-01T00:00:00.000Z' };
    await calendar.createBookingEvent(booking, 'Авторський чуттєвий масаж', 30, {
      telegramUsername: 'user61785',
      telegramDisplayName: 'Іван Петренко',
      messages: [
        { role: 'user', content: 'Підходить' },
        { role: 'assistant', content: '<b>Запис підтверджено.</b> Дякую &amp; до зустрічі.' },
      ],
    });
    const event = requests[0]?.body as { summary: string; description: string; extendedProperties: { private: Record<string, string> } };
    expect(event.summary.split(' | ')).toEqual(['@user61785', 'Іван Петренко', 'Авторський чуттєвий масаж', '4000 UAH (ai-bot)']);
    const descriptionLines = event.description.split('\n');
    expect(descriptionLines.slice(0, 3).map((line) => line.split(':')[0])).toEqual(['Booking ID', 'Client', 'Telegram chat']);
    expect(descriptionLines.slice(5).map((line) => line.split(':')[0])).toEqual(['Клієнт', 'Помічник']);
    expect(event.extendedProperties.private).toMatchObject({ bookingId: 'booking-1', clientId: 'client-1', serviceId: 'massage', durationMinutes: '90', price: '4000', currency: 'UAH', bufferMinutes: '30' });
  });
  it('keeps the latest 20 conversation entries within the Calendar description limit', async () => {
    const requests: Array<{ body?: unknown }> = [];
    const connection = {
      credentials: vi.fn(async () => ({ refreshToken: 'test', calendarId: 'calendar@example.com' })),
      request: vi.fn(async (_credentials: unknown, _path: string, init: RequestInit = {}) => {
        const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
        requests.push({ body });
        return { status: 200, json: async () => ({ ...(body ?? {}), etag: 'v1' }) };
      }),
    };
    const calendar = new CalendarService(connection as never);
    const booking = { id: 'booking-1', clientId: 'client-1', telegramChatId: 'chat-1', serviceId: 'massage', durationMinutes: 90, price: 4000, currency: 'UAH', startAt: '2099-01-01T09:00:00.000Z', endAt: '2099-01-01T10:30:00.000Z', status: 'confirmed' as const, calendarSyncStatus: 'synced' as const, createdAt: '2098-01-01T00:00:00.000Z', updatedAt: '2098-01-01T00:00:00.000Z' };
    const messages = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content: `${index}: ${'x'.repeat(400)}` }));

    await calendar.createBookingEvent(booking, 'Massage', 30, { telegramUsername: 'user61785', telegramDisplayName: 'Іван', messages });

    const event = requests[0]?.body as { description: string };
    expect(event.description.length).toBeLessThanOrEqual(2048);
    const transcriptLines = event.description.split('\n').slice(5);
    expect(transcriptLines).toHaveLength(20);
    expect(transcriptLines.map((line) => line.split(':')[0]).at(-1)).toBe('Помічник');
  });
  it('reads managed booking metadata and includes stored buffer in conflicts', async () => {
    const event = { id: bookingEventId('booking-1'), etag: 'v1', start: { dateTime: '2099-01-01T09:00:00.000Z' }, end: { dateTime: '2099-01-01T10:30:00.000Z' }, extendedProperties: { private: { schemaVersion: '1', bookingId: 'booking-1', clientId: 'client-1', telegramChatId: 'chat-1', serviceId: 'massage', durationMinutes: '90', price: '4000', currency: 'UAH', bufferMinutes: '30', createdAt: '2098-01-01T00:00:00.000Z' } } };
    const connection = { credentials: vi.fn(async () => ({ refreshToken: 'test', calendarId: 'calendar@example.com' })), request: vi.fn(async (_credentials: unknown, path: string) => new Response(JSON.stringify(path.includes('?') ? { items: [event] } : event))) };
    const calendar = new CalendarService(connection as never);
    expect(await calendar.getBooking('booking-1')).toMatchObject({ id: 'booking-1', price: 4000, durationMinutes: 90, serviceId: 'massage' });
    expect(await calendar.getBookingTiming('booking-1')).toEqual({ durationMinutes: 90, bufferMinutes: 30 });
    expect(await calendar.getBusyIntervals('2099-01-01T10:45:00.000Z', '2099-01-01T11:00:00.000Z')).toEqual([{ start: event.start.dateTime, end: '2099-01-01T11:00:00.000Z' }]);
  });
  it('backfills only an exact legacy event with conditional write', async () => {
    const id = 'legacy-1'; const eventId = bookingEventId(id);
    const booking = { id, clientId: 'client', telegramChatId: 'chat', serviceId: 'massage', durationMinutes: 60, price: 1500, currency: 'UAH', startAt: '2099-01-01T09:00:00.000Z', endAt: '2099-01-01T10:00:00.000Z', status: 'confirmed' as const, googleCalendarId: 'appointments', googleCalendarEventId: eventId, calendarSyncStatus: 'synced' as const, createdAt: '2098-01-01T00:00:00.000Z', updatedAt: '2098-01-01T00:00:00.000Z' };
    const legacy = { id: eventId, etag: 'v1', start: { dateTime: booking.startAt }, end: { dateTime: booking.endAt }, extendedProperties: { private: { bookingId: id } } };
    const request = vi.fn(async (_credentials: unknown, _path: string, init: RequestInit = {}) => new Response(JSON.stringify(init.method === 'PATCH' ? { ...legacy, extendedProperties: JSON.parse(String(init.body)).extendedProperties } : legacy)));
    const calendar = new CalendarService({ credentials: async () => ({ refreshToken: 'x', calendarId: 'appointments' }), request } as never);
    expect(await calendar.backfillLegacyBookingEvent(booking, 15)).toBe('needs_backfill');
    expect(request).toHaveBeenCalledTimes(1);
    expect(await calendar.backfillLegacyBookingEvent(booking, 15, true)).toBe('ready');
    expect(request.mock.calls[2]?.[2]).toMatchObject({ method: 'PATCH', headers: { 'If-Match': 'v1' } });
    const patch = JSON.parse(String(request.mock.calls[2]?.[2]?.body)) as { description: string };
    expect(patch.description.split('\n').slice(0, 3).map((line) => line.split(':')[0])).toEqual(['Booking ID', 'Client', 'Telegram chat']);
  });
});
