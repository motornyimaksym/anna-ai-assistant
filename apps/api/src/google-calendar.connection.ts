import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { GoogleCalendarChoice, GoogleCalendarStatus } from '@booking/contracts';
import { GoogleCalendarStore, openCalendar, sealCalendar } from './google-calendar.store.js';
import { fetchWithLinearBackoff, type LinearBackoffOptions } from '@booking/http';
import { safeErrorDiagnostic } from './debug-log.service.js';
const calendarScopes = ['calendar.events', 'calendar.freebusy', 'calendar.calendarlist.readonly'].map((scope) => `https://www.googleapis.com/auth/${scope}`);
const calendarRetryDelaysMs = [1000, 5000, 15000] as const;
const fail = (response?: Response) => Object.assign(new ServiceUnavailableException('Google Calendar request failed. Check the connection or reconnect in Settings.'), {
  ...(response ? { upstreamStatus: response.status, providerRequestId: response.headers?.get('x-request-id') ?? undefined } : {}),
});
export type CalendarCredentials = { refreshToken: string; calendarId?: string; conflictCalendarIds?: string[] };
@Injectable()
export class GoogleCalendarConnection {
  private readonly logger = new Logger(GoogleCalendarConnection.name);
  constructor(private readonly store: GoogleCalendarStore) {}
  private config() {
    const clientId = process.env.GOOGLE_CLIENT_ID; const clientSecret = process.env.GOOGLE_CLIENT_SECRET; const redirect = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirect || Buffer.from(process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY ?? '', 'base64').length !== 32) return undefined;
    try { const url = new URL(redirect); if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) || url.pathname !== '/google-calendar/callback' || url.search || url.hash || url.username || url.password) return undefined; } catch { return undefined; }
    return { clientId, clientSecret, redirect };
  }
  private legacy(): CalendarCredentials | undefined {
    return process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN && process.env.GOOGLE_CALENDAR_ID ? { refreshToken: process.env.GOOGLE_REFRESH_TOKEN, calendarId: process.env.GOOGLE_CALENDAR_ID } : undefined;
  }
  async credentials(): Promise<CalendarCredentials | undefined> {
    const record = await this.store.read();
    if (!record) return this.legacy();
    if (record.phase !== 'connected' || !record.encryptedToken) return undefined;
    return { refreshToken: openCalendar(record.encryptedToken, 'token'), calendarId: record.calendarId, conflictCalendarIds: record.conflictCalendarIds };
  }
  async status(): Promise<GoogleCalendarStatus> {
    const record = await this.store.read();
    if (!record) { const legacy = this.legacy(); return { configured: !!this.config(), phase: legacy ? 'connected' : 'disconnected', legacy: !!legacy, ...(legacy?.calendarId ? { calendarId: legacy.calendarId } : {}) }; }
    return { writePermission: record.grantedScopes ? (record.grantedScopes.includes(calendarScopes[0]!) ? 'granted' : 'missing') : 'unknown', conflictCalendarIds: record.conflictCalendarIds ?? (record.calendarId ? [record.calendarId] : []), configured: !!this.config(), phase: record.phase === 'pending' && (record.expiresAt ?? 0) <= Date.now() ? 'disconnected' : record.phase, legacy: false,
      ...(record.email ? { email: record.email } : {}), ...(record.calendarId ? { calendarId: record.calendarId, calendarTitle: record.calendarTitle } : {}), ...(record.checkedAt ? { checkedAt: record.checkedAt } : {}),
      ...(record.phase === 'connected' && record.refreshTokenExpiresAt ? { refreshTokenExpiresAt: record.refreshTokenExpiresAt } : {}) };
  }
  async start(uid: string) {
    const config = this.config(); if (!config) throw new ServiceUnavailableException('Google authorization is not configured. Ask the administrator to set up the OAuth client, callback URL and encryption key.');
    const state = randomBytes(32).toString('base64url'); const verifier = randomBytes(32).toString('base64url'); const nonce = randomBytes(32).toString('base64url');
    await this.store.begin(uid, state, sealCalendar(JSON.stringify({ verifier, nonce }), 'proof'));
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirect, response_type: 'code', scope: ['openid', 'email', ...calendarScopes].join(' '), access_type: 'offline', prompt: 'consent select_account', state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', ...(process.env.GOOGLE_CALENDAR_ACCOUNT_EMAIL ? { login_hint: process.env.GOOGLE_CALENDAR_ACCOUNT_EMAIL } : {}) }).toString();
    return { url: url.toString() };
  }
  async complete(uid: string, input: { state: string; code?: string; denied?: boolean }) {
    const config = this.config(); if (!config) throw fail();
    const pending = await this.store.consume(uid, input.state);
    try {
      if (input.denied) { await this.store.replace(pending.revision, { phase: 'disconnected' }); return this.status(); }
      const proof = z.object({ verifier: z.string(), nonce: z.string() }).parse(JSON.parse(openCalendar(pending.proof, 'proof')));
      const response = await fetchWithLinearBackoff('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000), body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirect, grant_type: 'authorization_code', code: input.code!, code_verifier: proof.verifier }) });
      if (!response.ok) throw fail(response);
      const tokens = z.object({ refresh_token: z.string().min(1), id_token: z.string().min(1), scope: z.string(), refresh_token_expires_in: z.number().int().positive().optional().catch(undefined) }).parse(await response.json());
      const expiration = tokens.refresh_token_expires_in === undefined ? undefined : new Date(Date.now() + tokens.refresh_token_expires_in * 1000);
      const refreshTokenExpiresAt = expiration && Number.isFinite(expiration.getTime()) ? expiration.toISOString() : undefined;
      if (!calendarScopes.every((scope) => tokens.scope.split(' ').includes(scope))) throw new BadRequestException('Required Calendar permissions were not granted. Connect again and allow the requested permissions.');
      const client = new OAuth2Client({ clientId: config.clientId, transporterOptions: { timeout: 15000, retryConfig: {
        retry: 3, httpMethodsToRetry: ['GET', 'HEAD', 'OPTIONS'], statusCodesToRetry: [[408, 408], [425, 425], [429, 429], [500, 599]], noResponseRetries: 3,
        retryBackoff: async (error) => new Promise<void>((resolve) => setTimeout(resolve, 250 * (error.config.retryConfig?.currentRetryAttempt ?? 1))),
      } } });
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
      const identity = ticket.getPayload();
      const expected = process.env.GOOGLE_CALENDAR_ACCOUNT_EMAIL?.trim().toLowerCase();
      if (!identity?.email || !identity.email_verified || (identity as { nonce?: string }).nonce !== proof.nonce || (expected && identity.email.toLowerCase() !== expected)) throw new BadRequestException('Google account did not match the expected verified account. Connect again using the correct account.');
      await this.store.replace(pending.revision, { phase: 'connected', grantedScopes: tokens.scope.split(' '), email: identity.email, encryptedToken: sealCalendar(tokens.refresh_token, 'token'), ...(refreshTokenExpiresAt ? { refreshTokenExpiresAt } : {}) });
      return this.status();
    } catch (error) {
      this.logger.error(`Google authorization exchange failed: ${JSON.stringify(safeErrorDiagnostic(error, [input.code ?? '', input.state, config.clientSecret]))}`);
      await this.store.replace(pending.revision, { phase: 'disconnected' }).catch(() => {});
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Google authorization could not be completed. Start again from Settings.');
    }
  }
  async accessToken(credentials: CalendarCredentials): Promise<string> {
    try {
      const response = await fetchWithLinearBackoff('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000), body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? '', client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '', refresh_token: credentials.refreshToken, grant_type: 'refresh_token' }) });
      if (!response.ok) throw fail(response);
      return z.object({ access_token: z.string().min(1) }).parse(await response.json()).access_token;
    } catch (error) { this.logger.error(`Google token refresh failed: ${JSON.stringify(safeErrorDiagnostic(error, [credentials.refreshToken, process.env.GOOGLE_CLIENT_SECRET ?? '']))}`); throw fail(); }
  }
  async request(credentials: CalendarCredentials, path: string, init: RequestInit = {}, allowedStatuses: number[] = [], retry: Pick<LinearBackoffOptions, 'replaySafe'> = {}): Promise<Response> {
    try {
      const token = await this.accessToken(credentials);
      const response = await fetchWithLinearBackoff(`https://www.googleapis.com/calendar/v3${path}`, { ...init, signal: AbortSignal.timeout(30000), headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers } }, { ...retry, retryDelaysMs: calendarRetryDelaysMs });
      if (!response.ok && !allowedStatuses.includes(response.status)) throw fail(response); return response;
    } catch (error) { this.logger.error(`Google Calendar API request failed: ${JSON.stringify(safeErrorDiagnostic(error))}`); throw fail(); }
  }
  async calendars(): Promise<GoogleCalendarChoice[]> {
    const credentials = await this.credentials(); if (!credentials) throw new BadRequestException('Connect Google Calendar first.');
    const result: GoogleCalendarChoice[] = []; let pageToken = '';
    for (let page = 0; page < 4; page++) {
      const response = await this.request(credentials, `/users/me/calendarList?minAccessRole=reader&maxResults=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
      const data = z.object({ items: z.array(z.object({ id: z.string(), summary: z.string().optional(), primary: z.boolean().optional(), accessRole: z.string() })).default([]), nextPageToken: z.string().optional() }).parse(await response.json());
      result.push(...data.items.filter((item) => ['reader', 'writer', 'owner'].includes(item.accessRole)).map((item) => ({ id: item.id, title: item.summary ?? item.id, primary: item.primary ?? false, writable: ['writer', 'owner'].includes(item.accessRole) })));
      if (!data.nextPageToken) return result; pageToken = data.nextPageToken;
    }
    throw new BadRequestException('Calendar list is incomplete. Reduce connected calendars before selecting.');
  }
  async select(calendarId: string) {
    const record = await this.store.read();
    if (record?.phase !== 'connected' || !record.encryptedToken) throw new BadRequestException('Connect Google Calendar in Settings first.');
    const credentials = { refreshToken: openCalendar(record.encryptedToken, 'token') };
    const response = await this.request(credentials, `/users/me/calendarList/${encodeURIComponent(calendarId)}`);
    const item = z.object({ id: z.string(), summary: z.string().optional(), accessRole: z.string() }).parse(await response.json());
    if (!['writer', 'owner'].includes(item.accessRole)) throw new BadRequestException('Choose a calendar with permission to edit events.');
    await this.store.replace(record.revision, { ...record, calendarId: item.id, conflictCalendarIds: [...new Set([item.id, ...(record.conflictCalendarIds ?? [])])].slice(0, 20), calendarTitle: item.summary ?? item.id, checkedAt: new Date().toISOString() });
    return this.status();
  }
  async check() {
    const record = await this.store.read(); const credentials = await this.credentials();
    if (!credentials?.calendarId) throw new BadRequestException('Select a calendar first.');
    const response = await this.request(credentials, `/users/me/calendarList/${encodeURIComponent(credentials.calendarId)}`);
    const item = z.object({ accessRole: z.string() }).parse(await response.json());
    if (!['writer', 'owner'].includes(item.accessRole)) throw new BadRequestException('Calendar access changed. Select a writable calendar.');
    const token = await this.accessToken(credentials);
    let grantedScopes: string[];
    try {
      const response = await fetchWithLinearBackoff('https://oauth2.googleapis.com/tokeninfo', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000) }, { replaySafe: true });
      if (!response.ok) throw fail(response);
      grantedScopes = z.object({ scope: z.string() }).parse(await response.json()).scope.split(' ');
    } catch (error) { this.logger.error(`Google Calendar token scope check failed: ${JSON.stringify(safeErrorDiagnostic(error))}`); throw fail(); }
    for (const id of credentials.conflictCalendarIds ?? []) {
      const check = await this.request(credentials, `/users/me/calendarList/${encodeURIComponent(id)}`);
      const role = z.object({ accessRole: z.string() }).parse(await check.json());
      if (!['reader', 'writer', 'owner'].includes(role.accessRole)) throw fail();
    }
    if (record) await this.store.replace(record.revision, { ...record, grantedScopes, checkedAt: new Date().toISOString() });
    else return { ...await this.status(), writePermission: grantedScopes.includes(calendarScopes[0]!) ? 'granted' as const : 'missing' as const };

    return this.status();
  }
  async selectConflicts(calendarIds: string[]) {
    const record = await this.store.read();
    if (record?.phase !== 'connected' || !record.calendarId) throw new BadRequestException('Select a booking calendar first.');
    const ids = [...new Set([record.calendarId, ...calendarIds])];
    if (ids.length > 20) throw new BadRequestException('Choose at most 20 calendars.');
    const available = await this.calendars();
    if (ids.some((id) => !available.some((item) => item.id === id))) throw new BadRequestException('Choose accessible calendars.');
    await this.store.replace(record.revision, { ...record, conflictCalendarIds: ids });
    return this.status();
  }
  async disconnect() {
    const record = await this.store.read();
    const credentials = await this.credentials();
    if (credentials) {
      try {
        const response = await fetchWithLinearBackoff('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000), body: new URLSearchParams({ token: credentials.refreshToken }) }, { replaySafe: true });
        if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; if (response.status !== 400 || body.error !== 'invalid_token') throw fail(response); }
      } catch (error) { this.logger.error(`Google token revocation failed: ${JSON.stringify(safeErrorDiagnostic(error, [credentials.refreshToken]))}`); throw new ServiceUnavailableException('Could not revoke Google access. Connection retained; try disconnecting again.'); }
    }
    await this.store.replace(record?.revision, { phase: 'disconnected' });
    return this.status();
  }
}
