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
      {query.data.sourceChatTitle && <Typography variant="body2">Source chat: {query.data.sourceChatTitle}</Typography>}
      {query.data.syncedAt && <Typography variant="body2">Last synced: {formatKyiv(query.data.syncedAt)} (Europe/Kyiv)</Typography>}
      {query.data.slots.length ? <List aria-label="Imported free slots" disablePadding>
        {query.data.slots.map((slot) => <ListItem key={slot.messageId} divider alignItems="flex-start" disableGutters>
          <ListItemText primary={slot.text} secondary={`Telegram message · ${formatKyiv(slot.createdAt)} (Europe/Kyiv)`} />
        </ListItem>)}
      </List> : <Alert severity="info">No imported free slots yet. Connect the owner Telegram account and wait for an incoming message.</Alert>}
    </Stack>}
  </Box>;
}
