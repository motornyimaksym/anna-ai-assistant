import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { BookingDto } from '@booking/contracts';
import { GoogleCalendarConnection } from './google-calendar.connection.js';
export type BusyInterval = { start: string; end: string };
@Injectable()
export class CalendarService {
  constructor(private readonly connection: GoogleCalendarConnection) {}
  async isConfigured(): Promise<boolean> { return !!(await this.connection.credentials())?.calendarId; }
  async getBusyIntervals(start: string, end: string): Promise<BusyInterval[]> {
    const credentials = await this.connection.credentials();
    if (!credentials?.calendarId) return [];
    const response = await this.connection.request(credentials, '/freeBusy', { method: 'POST', body: JSON.stringify({ timeMin: start, timeMax: end, items: [{ id: credentials.calendarId }] }) });
    const data = z.object({ calendars: z.record(z.object({ busy: z.array(z.object({ start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) })).optional(), errors: z.array(z.unknown()).optional() })) }).parse(await response.json());
    const calendar = data.calendars[credentials.calendarId];
    if (!calendar?.busy || calendar.errors?.length) throw new Error('Google Calendar availability could not be read');
    return calendar.busy;
  }
  async createBookingEvent(booking: BookingDto): Promise<{ eventId: string; calendarId: string }> {
    const credentials = await this.connection.credentials();
    if (!credentials?.calendarId) throw new Error('Google Calendar is not configured');
    const response = await this.connection.request(credentials, `/calendars/${encodeURIComponent(credentials.calendarId)}/events`, { method: 'POST', body: JSON.stringify({ summary: `Massage: ${booking.serviceId}`, description: `Booking ID: ${booking.id}\nTelegram chat: ${booking.telegramChatId}`, start: { dateTime: booking.startAt }, end: { dateTime: booking.endAt } }) });
    const data = z.object({ id: z.string().min(1) }).parse(await response.json());
    return { eventId: data.id, calendarId: credentials.calendarId };
  }
  async updateBookingEvent(booking: BookingDto): Promise<void> {
    const credentials = await this.connection.credentials();
    const calendarId = booking.googleCalendarId ?? credentials?.calendarId;
    if (!credentials || !calendarId || !booking.googleCalendarEventId) throw new Error('Google Calendar event is unavailable');
    await this.connection.request(credentials, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(booking.googleCalendarEventId)}`, { method: 'PATCH', body: JSON.stringify({ start: { dateTime: booking.startAt }, end: { dateTime: booking.endAt } }) });
  }
  async deleteBookingEvent(eventId: string, originalCalendarId?: string): Promise<void> {
    const credentials = await this.connection.credentials();
    const calendarId = originalCalendarId ?? credentials?.calendarId;
    if (!credentials || !calendarId) throw new Error('Google Calendar is not configured');
    await this.connection.request(credentials, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
  }
}
