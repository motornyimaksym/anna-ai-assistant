import { Alert, Button, Stack, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { TelegramScheduleSlotsResponse } from '@booking/contracts';
import { adminApi } from './api.js';
const labels = {
  idle: 'Waiting for a refresh.', syncing: 'Reading the schedule chat…', success: 'Last refresh succeeded.',
  source_not_found: 'Source chat was not found, its topic is unavailable, or its name is ambiguous. Select the source in Bot Settings.',
  disconnected: 'Telegram is disconnected or not configured. Check the account in Bot Settings.',
  account_busy: 'Telegram account is busy with another request. Retry now to start automatic retries.',
  connection_failed: 'Could not read Telegram. Check the connection and retry now.',
  timeout: 'Telegram did not finish in time. Retry now to start automatic retries.',
};
const scheduleLabels = {
  ...labels,
  account_busy: 'Telegram account is busy with another request. Wait for the next permitted refresh.',
  connection_failed: 'Could not read Telegram. Check the connection and retry after the cooldown.',
  timeout: 'Telegram did not finish in time. Retry after the cooldown.',
};
const failedStatuses = new Set(['source_not_found', 'disconnected', 'account_busy', 'connection_failed', 'timeout']);
const date = (value: string) => new Date(value).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
export function ScheduleSyncStatus({ data, enableManualRetries = false }: { data: TelegramScheduleSlotsResponse; enableManualRetries?: boolean }) {
  const cache = useQueryClient();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const refresh = useMutation({ mutationFn: () => adminApi.refreshSchedule(enableManualRetries), onSuccess: (result) => { cache.setQueryData(['telegram-schedule-slots'], result); setNow(Date.now()); } });
  const status = data.status ?? (data.syncedAt ? 'success' : 'idle');
  const cooldown = Math.max(0, Math.ceil(((data.nextAttemptAt ? Date.parse(data.nextAttemptAt) : 0) - now) / 1000));
  const failed = enableManualRetries && failedStatuses.has(status);
  const messages = enableManualRetries ? labels : scheduleLabels;
  return <Stack spacing={1}>
    {data.sourceChatTitle && <Typography>Source chat: {data.sourceChatTitle}{data.sourcePeerId ? ` (${data.sourcePeerId})` : ''}</Typography>}
    {data.sourceTopicTitle && <Typography>Source topic: {data.sourceTopicTitle} ({data.sourceTopicId})</Typography>}
    <Alert severity={status === 'success' ? 'success' : status === 'idle' || status === 'syncing' ? 'info' : 'warning'}>{messages[status]}</Alert>
    <Typography variant="body2">Last attempt: {data.lastAttemptAt ? date(data.lastAttemptAt) : 'Never'}</Typography>
    <Typography variant="body2">Last synced: {data.syncedAt ? date(data.syncedAt) : 'Never'} (Europe/Kyiv)</Typography>
    {data.nextAttemptAt && <Typography variant="body2">{enableManualRetries ? 'Next automatic refresh' : 'Next permitted refresh'}: {date(data.nextAttemptAt)} (Europe/Kyiv){cooldown ? ` · ${cooldown}s remaining` : ''}</Typography>}
    {enableManualRetries && refresh.isPending && <Typography variant="body2">Manual retry uses up to 5 attempts with 10, 20, 30, then 40 second waits.</Typography>}
    <Button variant="outlined" disabled={refresh.isPending || status === 'syncing' || (cooldown > 0 && !failed)} onClick={() => refresh.mutate()}>{refresh.isPending ? 'Refreshing…' : failed ? 'Retry now' : 'Refresh now'}</Button>
    {refresh.isError && <Alert severity="error">{refresh.error.message}</Alert>}
  </Stack>;
}
