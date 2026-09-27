import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { BookingDto } from '@booking/contracts';
import { localDayBounds } from '@booking/domain';
import { GoogleCalendarConnection, type CalendarCredentials } from './google-calendar.connection.js';
export type BusyInterval = { start: string; end: string };
export const bookingEventId = (id: string) => createHash('sha256').update(`booking:${id}`).digest('hex');
const instant = z.string().datetime({ offset: true });
const eventSchema = z.object({ id: z.string(), etag: z.string().optional(), status: z.string().optional(), transparency: z.string().optional(), start: z.object({ dateTime: instant.optional(), date: z.string().optional() }).optional(), end: z.object({ dateTime: instant.optional(), date: z.string().optional() }).optional(), extendedProperties: z.object({ private: z.record(z.string()).optional() }).optional() });
type CalendarEvent = z.infer<typeof eventSchema>;
const path = (calendarId: string, eventId?: string) => `/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`;
const sameTime = (event: CalendarEvent, booking: Pick<BookingDto, 'startAt' | 'endAt'>) => Date.parse(event.start?.dateTime ?? '') === Date.parse(booking.startAt) && Date.parse(event.end?.dateTime ?? '') === Date.parse(booking.endAt);
@Injectable()
export class CalendarService {
  constructor(private readonly connection: GoogleCalendarConnection) {}
  async isConfigured(): Promise<boolean> { return !!(await this.connection.credentials())?.calendarId; }
  async destination() { return (await this.required()).calendarId!; }
  private async required() {
    const credentials = await this.connection.credentials();
    if (!credentials?.calendarId) throw new Error('Google Calendar is not configured');
    return credentials;
  }
  async getBusyIntervals(start: string, end: string, exclude?: BookingDto): Promise<BusyInterval[]> {
    const credentials = await this.required();
    const ids = [...new Set([credentials.calendarId!, ...(credentials.conflictCalendarIds ?? []), ...(exclude?.googleCalendarId ? [exclude.googleCalendarId] : [])])];
    const original = exclude?.googleCalendarId ?? credentials.calendarId!;
    const busy: BusyInterval[] = [];
    const freeBusyIds = ids.filter((id) => !(exclude?.googleCalendarEventId && id === original));
    if (freeBusyIds.length) {
      const response = await this.connection.request(credentials, '/freeBusy', { method: 'POST', body: JSON.stringify({ timeMin: start, timeMax: end, items: freeBusyIds.map((id) => ({ id })) }) }, [], { replaySafe: true });
      const data = z.object({ calendars: z.record(z.object({ busy: z.array(z.object({ start: instant, end: instant })).optional(), errors: z.array(z.unknown()).optional() })) }).parse(await response.json());
      for (const id of freeBusyIds) {
        const calendar = data.calendars[id];
        if (!calendar?.busy || calendar.errors?.length) throw new Error('Google Calendar availability could not be read');
        busy.push(...calendar.busy);
      }
    }
    if (exclude?.googleCalendarEventId) busy.push(...await this.busyExceptEvent(credentials, original, start, end, exclude));
    return busy;
  }
  private owns(event: CalendarEvent, booking: BookingDto, strict = false) {
    const owner = event.extendedProperties?.private?.bookingId;
    if (event.id !== (booking.googleCalendarEventId ?? bookingEventId(booking.id)) || (owner ? owner !== booking.id : strict || event.id === bookingEventId(booking.id))) throw new Error('Calendar event ownership is uncertain');
  }
  private async busyExceptEvent(credentials: CalendarCredentials, calendarId: string, start: string, end: string, booking: BookingDto) {
    const result: BusyInterval[] = []; let pageToken = '';
    for (let page = 0; page < 20; page++) {
      const query = new URLSearchParams({ timeMin: start, timeMax: end, singleEvents: 'true', maxResults: '250', ...(pageToken ? { pageToken } : {}) });
      const response = await this.connection.request(credentials, `${path(calendarId)}?${query}`);
      const data = z.object({ items: z.array(eventSchema).default([]), nextPageToken: z.string().optional(), timeZone: z.string().optional() }).parse(await response.json());
      for (const event of data.items) {
        if (event.id === booking.googleCalendarEventId) { this.owns(event, booking); continue; }
        if (event.status === 'cancelled' || event.transparency === 'transparent') continue;
        const zone = data.timeZone ?? process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv';
        const from = event.start?.dateTime ?? (event.start?.date ? localDayBounds(event.start.date, zone).start : undefined);
        const to = event.end?.dateTime ?? (event.end?.date ? localDayBounds(event.end.date, zone).start : undefined);
        if (!from || !to || Date.parse(from) >= Date.parse(to)) throw new Error('Calendar event time is uncertain');
        result.push({ start: from, end: to });
      }
      if (!data.nextPageToken) return result;
      pageToken = data.nextPageToken;
    }
    throw new Error('Calendar history is incomplete');
  }
  async getBookingEvent(booking: BookingDto): Promise<CalendarEvent | undefined> {
    const credentials = await this.required();
    const response = await this.connection.request(credentials, path(booking.googleCalendarId ?? credentials.calendarId!, booking.googleCalendarEventId ?? bookingEventId(booking.id)), {}, [404, 410]);
    if ([404, 410].includes(response.status)) {
      // A missing event must not hide loss of access to its original calendar.
      const access = await this.connection.request(credentials, `/users/me/calendarList/${encodeURIComponent(booking.googleCalendarId ?? credentials.calendarId!)}`);
      const role = z.object({ accessRole: z.enum(['writer', 'owner']) }).parse(await access.json());
      if (!role.accessRole) throw new Error('Calendar access is uncertain');
      return undefined;
    }
    const event = eventSchema.parse(await response.json());
    if (event.status === 'cancelled' && event.id === (booking.googleCalendarEventId ?? bookingEventId(booking.id))) return undefined;
    this.owns(event, booking);
    if (event.transparency === 'transparent') throw new Error('Booking event no longer blocks time');
    return event;
  }
  async verifyBookingEvent(booking: BookingDto): Promise<boolean> {
    const event = await this.getBookingEvent(booking);
    if (!event) return false;
    if (!sameTime(event, booking)) throw new Error('Calendar event was changed. Human review required');
    return true;
  }
  async createBookingEvent(booking: BookingDto, serviceName = booking.serviceId): Promise<{ eventId: string; calendarId: string }> {
    const credentials = await this.required();
    const calendarId = booking.googleCalendarId ?? credentials.calendarId!;
    const eventId = booking.googleCalendarEventId ?? bookingEventId(booking.id);
    const response = await this.connection.request(credentials, path(calendarId), { method: 'POST', body: JSON.stringify({ id: eventId, summary: `Massage: ${serviceName}`, description: `Booking ID: ${booking.id}\nClient: ${booking.clientId}\nTelegram chat: ${booking.telegramChatId}`, extendedProperties: { private: { bookingId: booking.id } }, transparency: 'opaque', start: { dateTime: booking.startAt }, end: { dateTime: booking.endAt } }) }, [409], { replaySafe: true });
    if (response.status === 409) {
      if (!await this.verifyBookingEvent({ ...booking, googleCalendarId: calendarId, googleCalendarEventId: eventId })) throw new Error('Calendar event is missing');
    } else {
      const event = eventSchema.parse(await response.json()); this.owns(event, { ...booking, googleCalendarEventId: eventId }, true);
      if (!sameTime(event, booking)) throw new Error('Calendar write result is uncertain');
    }
    return { eventId, calendarId };
  }
  async updateBookingEvent(booking: BookingDto, original?: BookingDto): Promise<void> {
    const credentials = await this.required();
    if (!booking.googleCalendarEventId) throw new Error('Google Calendar event is unavailable');
    const event = await this.getBookingEvent(booking);
    if (!event) throw new Error('Calendar event is missing');
    if (sameTime(event, booking)) return;
    if (!original || !sameTime(event, original) || !event.etag) throw new Error('Calendar event was changed. Human review required');
    const response = await this.connection.request(credentials, path(booking.googleCalendarId ?? credentials.calendarId!, booking.googleCalendarEventId), { method: 'PATCH', headers: { 'If-Match': event.etag }, body: JSON.stringify({ start: { dateTime: booking.startAt }, end: { dateTime: booking.endAt } }) });
    const changed = eventSchema.parse(await response.json()); this.owns(changed, booking);
    if (!sameTime(changed, booking)) throw new Error('Calendar update result is uncertain');
  }
  async deleteBookingEvent(eventId: string, originalCalendarId?: string, booking?: BookingDto): Promise<void> {
    const credentials = await this.required();
    if (!booking) throw new Error('Booking ownership is required');
    const event = await this.getBookingEvent(booking);
    if (!event) return;
    if (!sameTime(event, booking) || !event.etag) throw new Error('Calendar event was changed. Human review required');
    await this.connection.request(credentials, path(originalCalendarId ?? credentials.calendarId!, eventId), { method: 'DELETE', headers: { 'If-Match': event.etag } }, [404, 410], { replaySafe: true });
  }
}
