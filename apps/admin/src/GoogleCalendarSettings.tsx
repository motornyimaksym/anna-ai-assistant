import { useState } from 'react';
import { Alert, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GoogleCalendarStatus } from '@booking/contracts';
import { adminApi } from './api.js';
import { useI18n } from "./i18n.js";
const key = ['google-calendar'];
export function GoogleCalendarSettings() {
  const { t, language } = useI18n();
  const cache = useQueryClient();
  const status = useQuery({ queryKey: key, queryFn: adminApi.googleCalendar, retry: false, gcTime: 0, refetchInterval: 15000 });
  const calendars = useQuery({ queryKey: ['google-calendars', status.data?.email], queryFn: adminApi.googleCalendars, enabled: status.data?.phase === 'connected', retry: false, gcTime: 0 });
  const [selected, setSelected] = useState(''); const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [conflicts, setConflicts] = useState<string[] | undefined>();
  const [notice, setNotice] = useState('');
  const update = (value: GoogleCalendarStatus) => { cache.setQueryData(key, value); void cache.invalidateQueries({ queryKey: ['google-calendars'] }); };
  const connect = useMutation({ mutationFn: adminApi.startGoogleCalendar, onSuccess: ({ url }) => { window.location.assign(url); } });
  const select = useMutation({ mutationFn: adminApi.selectGoogleCalendar, onSuccess: (value) => { update(value); setSelected(''); setNotice('Calendar selected. New appointments will be created here.'); } });
  const saveConflicts = useMutation({ mutationFn: adminApi.selectConflictCalendars, onSuccess: (value) => { update(value); setConflicts(undefined); setNotice('Conflict calendars saved.'); } });
  const check = useMutation({ mutationFn: adminApi.checkGoogleCalendar, onSuccess: (value) => { update(value); setNotice('Google Calendar connection verified.'); } });
  const disconnect = useMutation({ mutationFn: adminApi.disconnectGoogleCalendar, onSuccess: (value) => { update(value); cache.removeQueries({ queryKey: ['google-calendars'] }); setConfirmDisconnect(false); setNotice('Google Calendar disconnected.'); } });
  const busy = saveConflicts.isPending || connect.isPending || select.isPending || check.isPending || disconnect.isPending;
  const error = saveConflicts.error ?? connect.error ?? select.error ?? check.error ?? disconnect.error;
  return <Stack spacing={1.5}>
    <Typography variant="h6">{t("Google Calendar")}</Typography>
    <Typography variant="body2">{t("Connect Google Calendar to manage appointments and check busy times. Google will ask for permission to view your calendar list and manage events. Existing events remain when disconnected.")}</Typography>
    {status.isPending && <Typography>{t("Loading Calendar connection…")}</Typography>}
    {status.isError && <Alert severity="error">{t("Could not load Calendar connection.")}{t(" ")}<Button onClick={() => void status.refetch()}>{t("Retry")}</Button></Alert>}
    {status.data && <>
      {!status.data.configured && <Alert severity="warning">{t("Google authorization setup is incomplete. Ask the administrator to configure the OAuth client, callback URL and encryption key.")}</Alert>}
      <Typography>{t("Status:")}{t(" ")}{t(status.data.phase)}{status.data.email ? ` · ${status.data.email}` : t("")}</Typography>
      {status.data.phase === 'connected' && <Alert severity={status.data.writePermission === 'granted' ? 'success' : 'warning'}>
        {status.data.writePermission === 'granted' ? t("Event modification permission granted.") : status.data.writePermission === 'missing' ? t("Reconnect required: event modification permission missing. Disconnect, then connect and allow all requested permissions.") : t("Event modification permission unknown. Check connection; reconnect if permission is missing.")}
      </Alert>}
      {status.data.legacy && <Alert severity="info">{t("Using the existing server configuration. Connect here to manage authorization from Settings.")}</Alert>}
      {(status.data.phase !== 'connected' || status.data.legacy) && <Button variant="contained" disabled={busy || !status.data.configured} onClick={() => { setNotice(''); connect.mutate(); }}>{t("Connect Google Calendar")}</Button>}
      {status.data.phase === 'pending' && <Typography>{t("Authorization is pending. Finish Google consent or start again; the link expires after ten minutes.")}</Typography>}
      {status.data.calendarId && <Typography>{t("Selected calendar:")}{t(" ")}{status.data.calendarTitle ?? status.data.calendarId} ({status.data.calendarId})</Typography>}
      {status.data.checkedAt && <Typography variant="body2">{t("Last verified:")}{t(" ")}{new Date(status.data.checkedAt).toLocaleString(language === "uk" ? "uk-UA" : "en-US")}</Typography>}
      {status.data.phase === 'connected' && !status.data.legacy && <>
        {calendars.isPending && <Typography>{t("Loading calendars…")}</Typography>}
        {calendars.isError && <Alert severity="error">{t("Could not load calendars. Check permissions or reconnect.")}{t(" ")}<Button onClick={() => void calendars.refetch()}>{t("Retry")}</Button></Alert>}
        {calendars.data && <>
          {!calendars.data.length ? <Alert severity="info">{t("No calendars with permission to edit events were found.")}</Alert> : <>
            <TextField select label={t("Google calendar")} value={selected} disabled={busy} onChange={(event) => setSelected(event.target.value)}>
              {calendars.data.filter((calendar) => calendar.writable !== false).map((calendar) => <MenuItem key={calendar.id} value={calendar.id}>{calendar.title}{calendar.primary ? t(" (primary)") : t("")} · {calendar.id}</MenuItem>)}
            </TextField>
            {status.data.calendarId && <Stack><Typography>{t("Calendars that block appointments")}</Typography>
              {calendars.data.map((calendar) => <FormControlLabel key={calendar.id} label={calendar.title} control={<Checkbox disabled={busy || calendar.id === status.data!.calendarId} checked={calendar.id === status.data!.calendarId || (conflicts ?? status.data!.conflictCalendarIds ?? []).includes(calendar.id)} onChange={(_, checked) => setConflicts((current) => checked ? [...new Set([...(current ?? status.data!.conflictCalendarIds ?? []), calendar.id])] : (current ?? status.data!.conflictCalendarIds ?? []).filter((id) => id !== calendar.id))} />} />)}
              <Button disabled={busy || !conflicts} onClick={() => saveConflicts.mutate([...new Set([status.data!.calendarId!, ...(conflicts ?? [])])])}>{t("Save conflict calendars")}</Button>
            </Stack>}
            <Button disabled={busy || !selected} onClick={() => select.mutate(selected)}>{t("Use selected calendar")}</Button>
          </>}
        </>}
      </>}
      {status.data.phase === 'connected' && <Button disabled={busy || !status.data.calendarId} onClick={() => check.mutate()}>{t("Check Calendar connection")}</Button>}
      {status.data.phase !== 'disconnected' && <Button color="warning" disabled={busy} onClick={() => setConfirmDisconnect(true)}>{status.data.phase === 'pending' ? t("Cancel Calendar authorization") : t("Disconnect Google Calendar")}</Button>}
      {confirmDisconnect && <Alert severity="warning">{t("Disconnect Google Calendar? New appointments and changes to existing appointments will stop; existing events will remain.")}<Stack direction="row"><Button disabled={busy} onClick={() => disconnect.mutate()}>{t("Confirm disconnect")}</Button><Button onClick={() => setConfirmDisconnect(false)}>{t("Keep connection")}</Button></Stack></Alert>}
    </>}
    {busy && <Typography role="status">{t("Contacting Google…")}</Typography>}
    {error && <Alert severity="error">{t(error.message)}</Alert>}
    {notice && <Alert severity="success">{t(notice)}</Alert>}
  </Stack>;
}
