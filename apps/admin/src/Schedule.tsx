import { ScheduleSyncStatus } from './ScheduleSyncStatus.js';
import { Alert, Box, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from './api.js';

const formatKyiv = (value: string) => new Date(value).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });

export function Schedule() {
  const query = useQuery({ queryKey: ['telegram-schedule-slots'], queryFn: adminApi.telegramScheduleSlots, refetchInterval: 60_000 });
  return <Box>
    <Typography variant="h6" gutterBottom>Imported free slots</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      Read-only messages from the connected Telegram account. Refresh runs on incoming messages, at most once every five minutes.
    </Typography>
    {query.isPending ? <Typography>Loading imported slots…</Typography> : query.isError ? <Alert severity="error">Could not load imported schedule slots.</Alert> : <Stack spacing={2}>
      <ScheduleSyncStatus data={query.data} />

      {query.data.slots.length ? <List aria-label="Imported free slots" disablePadding>
        {query.data.slots.map((slot) => <ListItem key={slot.messageId} divider alignItems="flex-start" disableGutters>
          <ListItemText primary={slot.text} secondary={`Telegram message · ${formatKyiv(slot.createdAt)} (Europe/Kyiv)`} />
        </ListItem>)}
      </List> : <Alert severity="info">No imported free slots yet. Select the source chat in Bot Settings, then refresh when the cooldown allows.</Alert>}
      <Typography variant="h6">Calendar busy times</Typography>
      {!query.data.calendarAvailability ? <Alert severity="info">No Calendar snapshot yet. Refresh the schedule to load it.</Alert>
        : query.data.calendarAvailability.status === 'unavailable' ? <Alert severity="warning">Calendar was unavailable during the last sync ({formatKyiv(query.data.calendarAvailability.checkedAt)}). Refresh to try again.</Alert>
          : <Stack spacing={1}>
            <Typography variant="body2">Checked: {formatKyiv(query.data.calendarAvailability.checkedAt)} · Coverage: {formatKyiv(query.data.calendarAvailability.rangeStart)} – {formatKyiv(query.data.calendarAvailability.rangeEnd)} (Europe/Kyiv)</Typography>
            <Typography variant="body2" color="text.secondary">Read-only busy periods. Booking availability is checked live.</Typography>
            {query.data.calendarAvailability.busy.length ? <List aria-label="Calendar busy times" disablePadding>
              {query.data.calendarAvailability.busy.map((interval, index) => <ListItem key={`${interval.start}-${interval.end}-${index}`} divider disableGutters>
                <ListItemText primary={`${formatKyiv(interval.start)} – ${formatKyiv(interval.end)} (Europe/Kyiv)`} />
              </ListItem>)}
            </List> : <Alert severity="info">No busy periods in the synchronized Calendar range.</Alert>}
          </Stack>}
    </Stack>}
  </Box>;
}
