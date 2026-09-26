import { Alert, Button, Stack, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { TelegramScheduleSlotsResponse } from '@booking/contracts';
import { adminApi } from './api.js';
const labels = {
  idle: 'Waiting for a refresh.', syncing: 'Reading the schedule chat…', success: 'Last refresh succeeded.',
  source_not_found: 'Source chat was not found or its name is ambiguous. Select the source in Bot Settings.',
  disconnected: 'Telegram is disconnected or not configured. Check the account in Bot Settings.',
  account_busy: 'Telegram account is busy with another request. Retry after the cooldown.',
  connection_failed: 'Could not read Telegram. Check the connection and retry after the cooldown.',
  timeout: 'Telegram did not finish in time. Retry after the cooldown.',
};
const date = (value: string) => new Date(value).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
export function ScheduleSyncStatus({ data }: { data: TelegramScheduleSlotsResponse }) {
  const cache = useQueryClient();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const refresh = useMutation({ mutationFn: adminApi.refreshSchedule, onSuccess: (result) => { cache.setQueryData(['telegram-schedule-slots'], result); setNow(Date.now()); } });
  const status = data.status ?? (data.syncedAt ? 'success' : 'idle');
  const cooldown = Math.max(0, Math.ceil(((data.nextAttemptAt ? Date.parse(data.nextAttemptAt) : 0) - now) / 1000));
  return <Stack spacing={1}>
    {data.sourceChatTitle && <Typography>Source chat: {data.sourceChatTitle}{data.sourcePeerId ? ` (${data.sourcePeerId})` : ''}</Typography>}
    <Alert severity={status === 'success' ? 'success' : status === 'idle' || status === 'syncing' ? 'info' : 'warning'}>{labels[status]}</Alert>
    <Typography variant="body2">Last attempt: {data.lastAttemptAt ? date(data.lastAttemptAt) : 'Never'}</Typography>
    <Typography variant="body2">Last synced: {data.syncedAt ? date(data.syncedAt) : 'Never'} (Europe/Kyiv)</Typography>
    {data.nextAttemptAt && <Typography variant="body2">Next permitted refresh: {date(data.nextAttemptAt)} (Europe/Kyiv){cooldown ? ` · ${cooldown}s remaining` : ''}</Typography>}
    <Button variant="outlined" disabled={refresh.isPending || cooldown > 0} onClick={() => refresh.mutate()}>{refresh.isPending ? 'Refreshing…' : 'Refresh now'}</Button>
    {refresh.isError && <Alert severity="error">{refresh.error.message}</Alert>}
  </Stack>;
}
