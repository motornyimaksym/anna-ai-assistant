import { useState } from 'react';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SystemOneSettings as Settings } from '@booking/contracts';
import { adminApi } from './api.js';

const queryKey = ['system-one-settings'];
export function SystemOneSettings() {
  const cache = useQueryClient();
  const query = useQuery({ queryKey, queryFn: adminApi.systemOneSettings });
  const [draft, setDraft] = useState<Settings['provider']>();
  const [saved, setSaved] = useState(false);
  const save = useMutation({ mutationFn: adminApi.saveSystemOneSettings, onSuccess: (value) => { cache.setQueryData(queryKey, value); setDraft(undefined); setSaved(true); } });
  if (query.isPending) return <Typography>Loading System One provider…</Typography>;
  if (query.isError) return <Alert severity="error" action={<Button onClick={() => void query.refetch()}>Retry</Button>}>Could not load System One provider.</Alert>;
  const provider = draft ?? query.data.provider;
  return <Stack spacing={2}>
    <Typography variant="h6">System One</Typography>
    <Typography variant="body2" color="text.secondary">Choose the provider for routing, approval and probability decisions. OpenAI is the default.</Typography>
    <TextField select label="System One provider" value={provider} disabled={save.isPending} slotProps={{ select: { native: true }, htmlInput: { 'aria-label': 'System One provider' } }} onChange={(event) => { setDraft(event.target.value as Settings['provider']); setSaved(false); save.reset(); }} sx={{ maxWidth: 440 }}>
      <option value="openai">OpenAI</option><option value="typesafe">TypeSafe AI</option>
    </TextField>
    <Typography variant="body2" color="text.secondary">{provider === 'typesafe' ? 'TypeSafe AI falls back to OpenAI on provider errors. A negative approval decision does not trigger fallback.' : 'OpenAI handles these decisions directly using the configured OpenAI model.'}</Typography>
    <Typography variant="caption" color="text.secondary">Changing providers does not restore discarded proposals or retry bookings.</Typography>
    {saved && <Alert severity="success">Saved. The next System One decision will use this provider.</Alert>}
    {save.isError && <Alert severity="error">Could not save provider. Please try again.</Alert>}
    <Box><Button variant="contained" disabled={provider === query.data.provider || save.isPending} onClick={() => save.mutate({ provider })}>{save.isPending ? 'Saving…' : 'Save provider'}</Button></Box>
  </Stack>;
}
