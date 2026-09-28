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
const managedProperties = z.object({ schemaVersion: z.literal('1'), bookingId: z.string().min(1), clientId: z.string().min(1), telegramChatId: z.string().min(1), businessConnectionId: z.string().optional(), serviceId: z.string().min(1), durationMinutes: z.coerce.number().int().min(15).max(480), price: z.coerce.number().finite().nonnegative(), currency: z.string().length(3), bufferMinutes: z.coerce.number().int().min(0).max(120), createdAt: instant });
export type ManagedBooking = { booking: BookingDto; bufferMinutes: number };
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
  private parseManaged(event: CalendarEvent, calendarId: string): ManagedBooking | undefined {
    const parsed = managedProperties.safeParse(event.extendedProperties?.private);
    if (!parsed.success || event.status === 'cancelled' || event.transparency === 'transparent') return undefined;
    const data = parsed.data;
    const startAt = event.start?.dateTime; const endAt = event.end?.dateTime;
    if (event.id !== bookingEventId(data.bookingId) || !startAt || !endAt || Date.parse(startAt) >= Date.parse(endAt) || (Date.parse(endAt) - Date.parse(startAt)) / 60_000 !== data.durationMinutes) return undefined;
    return { booking: { id: data.bookingId, clientId: data.clientId, telegramChatId: data.telegramChatId, ...(data.businessConnectionId ? { businessConnectionId: data.businessConnectionId } : {}), serviceId: data.serviceId, durationMinutes: data.durationMinutes, price: data.price, currency: data.currency, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), status: 'confirmed', googleCalendarEventId: event.id, googleCalendarId: calendarId, calendarSyncStatus: 'synced', createdAt: data.createdAt, updatedAt: data.createdAt }, bufferMinutes: data.bufferMinutes };
  }
  private async eventPages(credentials: CalendarCredentials, calendarId: string, start?: string, end?: string): Promise<CalendarEvent[]> {
    const events: CalendarEvent[] = []; let pageToken = '';
    for (let page = 0; page < 40; page++) {
      const query = new URLSearchParams({ singleEvents: 'true', maxResults: '250', ...(start ? { timeMin: start } : {}), ...(end ? { timeMax: end } : {}), ...(pageToken ? { pageToken } : {}) });
      const response = await this.connection.request(credentials, `${path(calendarId)}?${query}`);
      const data = z.object({ items: z.array(eventSchema).default([]), nextPageToken: z.string().optional() }).parse(await response.json());
      events.push(...data.items);
      if (!data.nextPageToken) return events;
      pageToken = data.nextPageToken;
    }
    throw new Error('Calendar event list is incomplete');
  }
  async listBookings(start?: string, end?: string): Promise<BookingDto[]> {
    const credentials = await this.required();
    const ids = [...new Set([credentials.calendarId!, ...(credentials.conflictCalendarIds ?? [])])];
    const pages = await Promise.all(ids.map(async (id) => (await this.eventPages(credentials, id, start, end)).flatMap((event) => { const result = this.parseManaged(event, id); return result ? [result.booking] : []; })));
    const bookings = pages.flat();
    if (new Set(bookings.map((booking) => booking.id)).size !== bookings.length) throw new Error('Duplicate managed Calendar booking IDs require review');
    return bookings.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
  async getBooking(id: string): Promise<BookingDto | undefined> {
    const credentials = await this.required();
    let found: BookingDto | undefined;
    for (const calendarId of [...new Set([credentials.calendarId!, ...(credentials.conflictCalendarIds ?? [])])]) {
      const response = await this.connection.request(credentials, path(calendarId, bookingEventId(id)), {}, [404, 410]);
      if ([404, 410].includes(response.status)) {
        const access = await this.connection.request(credentials, `/users/me/calendarList/${encodeURIComponent(calendarId)}`);
        z.object({ accessRole: z.enum(['reader', 'writer', 'owner']) }).parse(await access.json());
        continue;
      }
      const event = eventSchema.parse(await response.json());
      if (event.status === 'cancelled' && event.id === bookingEventId(id)) continue;
      const managed = this.parseManaged(event, calendarId);
      if (!managed || managed.booking.id !== id) throw new Error('Calendar booking ownership is uncertain');
      if (found) throw new Error('Duplicate managed Calendar booking IDs require review');
      found = managed.booking;
    }
    return found;
  }
  async getBookingTiming(id: string): Promise<{ durationMinutes: number; bufferMinutes: number }> {
    const booking = await this.getBooking(id); if (!booking) throw new Error('Booking not found');
    const credentials = await this.required();
    const response = await this.connection.request(credentials, path(booking.googleCalendarId!, booking.googleCalendarEventId!));
    const managed = this.parseManaged(eventSchema.parse(await response.json()), booking.googleCalendarId!);
    if (!managed) throw new Error('Calendar booking metadata is invalid');
    return { durationMinutes: managed.booking.durationMinutes!, bufferMinutes: managed.bufferMinutes };
  }
  async getBusyIntervals(start: string, end: string, exclude?: BookingDto): Promise<BusyInterval[]> {
    const credentials = await this.required();
    const ids = [...new Set([credentials.calendarId!, ...(credentials.conflictCalendarIds ?? []), ...(exclude?.googleCalendarId ? [exclude.googleCalendarId] : [])])];
    const original = exclude?.googleCalendarId ?? credentials.calendarId!;
    const busy: BusyInterval[] = [];
    const freeBusyIds = ids.filter((id) => id !== credentials.calendarId! && !(exclude?.googleCalendarEventId && id === original));
    if (freeBusyIds.length) {
      const response = await this.connection.request(credentials, '/freeBusy', { method: 'POST', body: JSON.stringify({ timeMin: start, timeMax: end, items: freeBusyIds.map((id) => ({ id })) }) }, [], { replaySafe: true });
      const data = z.object({ calendars: z.record(z.object({ busy: z.array(z.object({ start: instant, end: instant })).optional(), errors: z.array(z.unknown()).optional() })) }).parse(await response.json());
      for (const id of freeBusyIds) {
        const calendar = data.calendars[id];
        if (!calendar?.busy || calendar.errors?.length) throw new Error('Google Calendar availability could not be read');
        busy.push(...calendar.busy);
      }
    }
    busy.push(...await this.busyExceptEvent(credentials, credentials.calendarId!, start, end, exclude));
    if (original !== credentials.calendarId! && exclude?.googleCalendarEventId) busy.push(...await this.busyExceptEvent(credentials, original, start, end, exclude));
    return busy;
  }
  private owns(event: CalendarEvent, booking: BookingDto, strict = false) {
    const owner = event.extendedProperties?.private?.bookingId;
    if (event.id !== (booking.googleCalendarEventId ?? bookingEventId(booking.id)) || (owner ? owner !== booking.id : strict || event.id === bookingEventId(booking.id))) throw new Error('Calendar event ownership is uncertain');
  }
  private async busyExceptEvent(credentials: CalendarCredentials, calendarId: string, start: string, end: string, booking?: BookingDto) {
    const result: BusyInterval[] = []; let pageToken = '';
    for (let page = 0; page < 20; page++) {
      const query = new URLSearchParams({ timeMin: new Date(Date.parse(start) - 120 * 60_000).toISOString(), timeMax: end, singleEvents: 'true', maxResults: '250', ...(pageToken ? { pageToken } : {}) });
      const response = await this.connection.request(credentials, `${path(calendarId)}?${query}`);
      const data = z.object({ items: z.array(eventSchema).default([]), nextPageToken: z.string().optional(), timeZone: z.string().optional() }).parse(await response.json());
      for (const event of data.items) {
        if (booking && event.id === booking.googleCalendarEventId) { this.owns(event, booking); continue; }
        if (event.status === 'cancelled' || event.transparency === 'transparent') continue;
        const zone = data.timeZone ?? process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv';
        const from = event.start?.dateTime ?? (event.start?.date ? localDayBounds(event.start.date, zone).start : undefined);
        const to = event.end?.dateTime ?? (event.end?.date ? localDayBounds(event.end.date, zone).start : undefined);
        if (!from || !to || Date.parse(from) >= Date.parse(to)) throw new Error('Calendar event time is uncertain');
        const managed = this.parseManaged(event, calendarId);
        if (event.extendedProperties?.private?.bookingId && !managed) throw new Error('Calendar booking metadata is uncertain');
        result.push({ start: from, end: managed ? new Date(Date.parse(to) + managed.bufferMinutes * 60_000).toISOString() : to });
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
  async backfillLegacyBookingEvent(booking: BookingDto, bufferMinutes: number, serviceName: string, apply = false): Promise<'ready' | 'needs_backfill'> {
    if (!booking.googleCalendarId || !booking.googleCalendarEventId || !booking.durationMinutes || booking.price === undefined || !booking.currency || !Number.isInteger(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 120) throw new Error('Legacy booking snapshot is incomplete');
    const event = await this.getBookingEvent(booking);
    if (!event || !sameTime(event, booking) || !event.etag) throw new Error('Legacy Calendar event is missing or changed');
    const existing = this.parseManaged(event, booking.googleCalendarId);
    if (existing) {
      if (existing.booking.id !== booking.id || existing.bufferMinutes !== bufferMinutes) throw new Error('Calendar metadata differs from legacy booking');
      return 'ready';
    }
    const owner = event.extendedProperties?.private?.bookingId;
    if (owner !== booking.id) throw new Error('Legacy Calendar ownership is uncertain');
    if (!apply) return 'needs_backfill';
    const credentials = await this.required();
    const metadata = { schemaVersion: '1', bookingId: booking.id, clientId: booking.clientId, telegramChatId: booking.telegramChatId, ...(booking.businessConnectionId ? { businessConnectionId: booking.businessConnectionId } : {}), serviceId: booking.serviceId, durationMinutes: String(booking.durationMinutes), price: String(booking.price), currency: booking.currency, bufferMinutes: String(bufferMinutes), createdAt: booking.createdAt };
    const response = await this.connection.request(credentials, path(booking.googleCalendarId, booking.googleCalendarEventId), { method: 'PATCH', headers: { 'If-Match': event.etag }, body: JSON.stringify({ description: `Service: ${serviceName}\nBooking ID: ${booking.id}\nClient: ${booking.clientId}\nTelegram chat: ${booking.telegramChatId}`, extendedProperties: { private: metadata } }) });
    const changed = this.parseManaged(eventSchema.parse(await response.json()), booking.googleCalendarId);
    if (!changed || changed.booking.id !== booking.id || changed.bufferMinutes !== bufferMinutes) throw new Error('Calendar backfill result is uncertain');
    return 'ready';
  }
  async createBookingEvent(booking: BookingDto, serviceName = booking.serviceId, bufferMinutes = 0): Promise<{ eventId: string; calendarId: string }> {
    const credentials = await this.required();
    const calendarId = booking.googleCalendarId ?? credentials.calendarId!;
    const eventId = booking.googleCalendarEventId ?? bookingEventId(booking.id);
    if (!booking.durationMinutes || booking.price === undefined || !booking.currency) throw new Error('Booking snapshot is incomplete');
    const response = await this.connection.request(credentials, path(calendarId), { method: 'POST', body: JSON.stringify({ id: eventId, summary: `Massage: ${serviceName}`, description: `Service: ${serviceName}\nBooking ID: ${booking.id}\nClient: ${booking.clientId}\nTelegram chat: ${booking.telegramChatId}`, extendedProperties: { private: { schemaVersion: '1', bookingId: booking.id, clientId: booking.clientId, telegramChatId: booking.telegramChatId, ...(booking.businessConnectionId ? { businessConnectionId: booking.businessConnectionId } : {}), serviceId: booking.serviceId, durationMinutes: String(booking.durationMinutes), price: String(booking.price), currency: booking.currency, bufferMinutes: String(bufferMinutes), createdAt: booking.createdAt } }, transparency: 'opaque', start: { dateTime: booking.startAt }, end: { dateTime: booking.endAt } }) }, [409], { replaySafe: true });
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
