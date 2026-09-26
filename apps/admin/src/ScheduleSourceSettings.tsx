import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Button, Stack, TextField, Typography } from '@mui/material';
import type { TelegramScheduleChats } from '@booking/contracts';
import { adminApi } from './api.js';
import { ScheduleSyncStatus } from './ScheduleSyncStatus.js';
export function ScheduleSourceSettings() {
  const cache = useQueryClient();
  const [selected, setSelected] = useState<TelegramScheduleChats['chats'][number] | null>(null);
  const snapshot = useQuery({ queryKey: ['telegram-schedule-slots'], queryFn: adminApi.telegramScheduleSlots, refetchInterval: 15000 });
  const chats = useQuery({ queryKey: ['telegram-schedule-source-chats'], queryFn: adminApi.telegramScheduleChats, enabled: false, retry: false, gcTime: 0 });
  const save = useMutation({ mutationFn: adminApi.selectScheduleSource, onSuccess: (data) => { cache.setQueryData(['telegram-schedule-slots'], data); setSelected(null); } });
  return <Stack spacing={1.5}>
    <Typography variant="h6">Schedule source</Typography>
    <Typography variant="body2">Choose the whole Telegram chat to import. Private chats, groups, and channels are supported. Messages remain read-only; changing source clears the previous snapshot.</Typography>
    <Button disabled={chats.isFetching || save.isPending} onClick={() => void chats.refetch()}>{chats.isFetching ? 'Loading chats…' : 'Load Telegram chats'}</Button>
    {chats.isError && <Alert severity="error">{chats.error.message}</Alert>}
    {chats.data && <>
      {chats.data.truncated && <Alert severity="warning">Showing the first 1,000 chats. If yours is missing, move it into your recent chats and reload.</Alert>}
      <Autocomplete options={chats.data.chats} value={selected} onChange={(_, value) => setSelected(value)} isOptionEqualToValue={(a, b) => a.id === b.id} getOptionLabel={(chat) => `${chat.title} · ${chat.kind} · ${chat.id}`} disabled={save.isPending} renderInput={(params) => <TextField {...params} label="Schedule chat" />} />
      <Button variant="contained" disabled={!selected || save.isPending} onClick={() => { if (selected) save.mutate(selected.id); }}>Save schedule source</Button>
    </>}
    {save.isError && <Alert severity="error">{save.error.message}</Alert>}
    {save.isSuccess && <Alert severity="success">Source saved. Use Refresh now when the cooldown allows.</Alert>}
    {snapshot.isError && <Alert severity="error">Could not load sync status.</Alert>}
    {snapshot.data && <ScheduleSyncStatus data={snapshot.data} />}
  </Stack>;
}
