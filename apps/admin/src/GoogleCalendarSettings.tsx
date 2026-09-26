import { useState } from 'react';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GoogleCalendarStatus } from '@booking/contracts';
import { adminApi } from './api.js';
const key = ['google-calendar'];
export function GoogleCalendarSettings() {
  const cache = useQueryClient();
  const status = useQuery({ queryKey: key, queryFn: adminApi.googleCalendar, retry: false, gcTime: 0, refetchInterval: 15000 });
  const calendars = useQuery({ queryKey: ['google-calendars', status.data?.email], queryFn: adminApi.googleCalendars, enabled: status.data?.phase === 'connected', retry: false, gcTime: 0 });
  const [selected, setSelected] = useState(''); const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [notice, setNotice] = useState('');
  const update = (value: GoogleCalendarStatus) => { cache.setQueryData(key, value); void cache.invalidateQueries({ queryKey: ['google-calendars'] }); };
  const connect = useMutation({ mutationFn: adminApi.startGoogleCalendar, onSuccess: ({ url }) => { window.location.assign(url); } });
  const select = useMutation({ mutationFn: adminApi.selectGoogleCalendar, onSuccess: (value) => { update(value); setSelected(''); setNotice('Calendar selected. New bookings will sync here.'); } });
  const check = useMutation({ mutationFn: adminApi.checkGoogleCalendar, onSuccess: (value) => { update(value); setNotice('Google Calendar connection verified.'); } });
  const disconnect = useMutation({ mutationFn: adminApi.disconnectGoogleCalendar, onSuccess: (value) => { update(value); cache.removeQueries({ queryKey: ['google-calendars'] }); setConfirmDisconnect(false); setNotice('Google Calendar disconnected.'); } });
  const busy = connect.isPending || select.isPending || check.isPending || disconnect.isPending;
  const error = connect.error ?? select.error ?? check.error ?? disconnect.error;
  return <Stack spacing={1.5}>
    <Typography variant="h6">Google Calendar</Typography>
    <Typography variant="body2">Connect a Google account to check busy times and sync massage appointments. Google will ask for permission to view your calendar list and manage events. Existing events remain when disconnected.</Typography>
    {status.isPending && <Typography>Loading Calendar connection…</Typography>}
    {status.isError && <Alert severity="error">Could not load Calendar connection. <Button onClick={() => void status.refetch()}>Retry</Button></Alert>}
    {status.data && <>
      {!status.data.configured && <Alert severity="warning">Google authorization setup is incomplete. Ask the administrator to configure the OAuth client, callback URL and encryption key.</Alert>}
      <Typography>Status: {status.data.phase}{status.data.email ? ` · ${status.data.email}` : ''}</Typography>
      {status.data.legacy && <Alert severity="info">Using the existing server configuration. Connect here to manage authorization from Settings.</Alert>}
      {(status.data.phase !== 'connected' || status.data.legacy) && <Button variant="contained" disabled={busy || !status.data.configured} onClick={() => { setNotice(''); connect.mutate(); }}>Connect Google Calendar</Button>}
      {status.data.phase === 'pending' && <Typography>Authorization is pending. Finish Google consent or start again; the link expires after ten minutes.</Typography>}
      {status.data.calendarId && <Typography>Selected calendar: {status.data.calendarTitle ?? status.data.calendarId} ({status.data.calendarId})</Typography>}
      {status.data.checkedAt && <Typography variant="body2">Last verified: {new Date(status.data.checkedAt).toLocaleString()}</Typography>}
      {status.data.phase === 'connected' && !status.data.legacy && <>
        {calendars.isPending && <Typography>Loading calendars…</Typography>}
        {calendars.isError && <Alert severity="error">Could not load calendars. Check permissions or reconnect. <Button onClick={() => void calendars.refetch()}>Retry</Button></Alert>}
        {calendars.data && <>
          {!calendars.data.length ? <Alert severity="info">No calendars with permission to edit events were found.</Alert> : <>
            <TextField select label="Google calendar" value={selected} disabled={busy} onChange={(event) => setSelected(event.target.value)}>
              {calendars.data.map((calendar) => <MenuItem key={calendar.id} value={calendar.id}>{calendar.title}{calendar.primary ? ' (primary)' : ''} · {calendar.id}</MenuItem>)}
            </TextField>
            <Button disabled={busy || !selected} onClick={() => select.mutate(selected)}>Use selected calendar</Button>
          </>}
        </>}
      </>}
      {status.data.phase === 'connected' && <Button disabled={busy || !status.data.calendarId} onClick={() => check.mutate()}>Check Calendar connection</Button>}
      {status.data.phase !== 'disconnected' && <Button color="warning" disabled={busy} onClick={() => setConfirmDisconnect(true)}>{status.data.phase === 'pending' ? 'Cancel Calendar authorization' : 'Disconnect Google Calendar'}</Button>}
      {confirmDisconnect && <Alert severity="warning">Disconnect Google Calendar? Future calendar sync will stop; existing events will remain.<Stack direction="row"><Button disabled={busy} onClick={() => disconnect.mutate()}>Confirm disconnect</Button><Button onClick={() => setConfirmDisconnect(false)}>Keep connection</Button></Stack></Alert>}
    </>}
    {busy && <Typography role="status">Contacting Google…</Typography>}
    {error && <Alert severity="error">{error.message}</Alert>}
    {notice && <Alert severity="success">{notice}</Alert>}
  </Stack>;
}
