import { Alert, Button, Chip, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { adminApi } from './api.js';

const useDebugAccess = (uid: string) => useQuery({ queryKey: ['debug-access', uid], queryFn: adminApi.debugAccess, retry: false, staleTime: 0 });
export const DebugLink = ({ uid }: { uid: string }) => {
  const access = useDebugAccess(uid);
  return access.data?.canView ? <Button color="inherit" component={NavLink} to="/debug">Debug</Button> : null;
};
export const DebugLogs = ({ uid }: { uid: string }) => {
  const access = useDebugAccess(uid);
  const [tab, setTab] = useState<'log' | 'test'>('log');
  const [filter, setFilter] = useState('');
  const logs = useQuery({ queryKey: ['debug-logs', uid], queryFn: adminApi.debugLogs, enabled: access.data?.canView === true && tab === 'log', retry: false, gcTime: 0 });
  if (access.isPending) return <Typography>Checking access…</Typography>;
  if (access.isError || !access.data?.canView) return <Alert severity="warning">Debug tools are available only to the designated owner account.</Alert>;
  return <Stack spacing={2}>
    <Tabs value={tab} onChange={(_, value: 'log' | 'test') => setTab(value)} aria-label="Debug sections">
      <Tab value="log" label="System log" />
      <Tab value="test" label="Prompt test" />
    </Tabs>
    {tab === 'test' ? <PromptTest /> : <>
    <Typography variant="body2">Latest 200 diagnostic events. Messages, prompts, credentials, and private Calendar details are excluded. Events begin after this feature is deployed.</Typography>
    <Stack direction="row" spacing={2}>
      <TextField label="Filter stage, status or trace" value={filter} onChange={(event) => setFilter(event.target.value)} fullWidth size="small" />
      <Button onClick={() => void logs.refetch()} disabled={logs.isFetching}>Refresh</Button>
    </Stack>
    {logs.isPending && <Typography>Loading logs…</Typography>}
    {logs.isError && <Alert severity="error">Could not load debug logs.</Alert>}
    {logs.data?.length === 0 && <Alert severity="info">No diagnostic events yet.</Alert>}
    {logs.data?.filter((event) => JSON.stringify(event).toLowerCase().includes(filter.toLowerCase())).map((event) => <Paper key={event.id} variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label={event.level} color={event.level === 'error' ? 'error' : event.level === 'warn' ? 'warning' : 'default'} /><Typography fontWeight="bold">{event.stage}</Typography><Typography variant="body2">{new Date(event.createdAt).toLocaleString()}</Typography></Stack>
      <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>Trace: {event.traceId} · Chat reference: {event.chatRef}</Typography>
      <Typography component="pre" variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', mb: 0 }}>{JSON.stringify(event.details, null, 2)}</Typography>
    </Paper>)}
    </>}
  </Stack>;
};

const onePrompts = [
  { value: 'routing', label: 'Routing' }, { value: 'approval', label: 'Approval' },
  { value: 'rejection', label: 'Rejection' }, { value: 'probability', label: 'Probability' },
] as const;
const twoPrompts = [
  { value: 'general', label: 'General' }, { value: 'booking-conversation', label: 'Booking conversation' },
  { value: 'booking-planner', label: 'Booking planner' },
] as const;
const PromptTest = () => {
  const [system, setSystem] = useState<'one' | 'two'>('one');
  const [onePrompt, setOnePrompt] = useState<(typeof onePrompts)[number]['value']>('routing');
  const [twoPrompt, setTwoPrompt] = useState<(typeof twoPrompts)[number]['value']>('general');
  const [intent, setIntent] = useState<'availability' | 'create'>('availability');
  const [example, setExample] = useState('');
  const test = useMutation({ mutationFn: adminApi.promptTest });
  const promptId = system === 'one' ? onePrompt : twoPrompt;
  const run = () => {
    if (system === 'one') test.mutate({ system, promptId: onePrompt, text: example });
    else if (twoPrompt === 'booking-planner') test.mutate({ system, promptId: twoPrompt, intent, text: example });
    else test.mutate({ system, promptId: twoPrompt, text: example });
  };
  return <Stack spacing={2}>
    <Typography variant="body2">One isolated model turn. No tools execute; no bookings, messages, or events are saved.</Typography>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <TextField select label="System" value={system} onChange={(event) => { setSystem(event.target.value as 'one' | 'two'); test.reset(); }} disabled={test.isPending} sx={{ minWidth: 180 }}>
        <MenuItem value="one">System One</MenuItem><MenuItem value="two">System Two</MenuItem>
      </TextField>
      <TextField select label="Prompt" value={promptId} onChange={(event) => { if (system === 'one') setOnePrompt(event.target.value as typeof onePrompt); else setTwoPrompt(event.target.value as typeof twoPrompt); test.reset(); }} disabled={test.isPending} sx={{ minWidth: 220 }}>
        {(system === 'one' ? onePrompts : twoPrompts).map(({ value, label }) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
      </TextField>
      {system === 'two' && twoPrompt === 'booking-planner' && <TextField select label="Planner intent" value={intent} onChange={(event) => { setIntent(event.target.value as typeof intent); test.reset(); }} disabled={test.isPending} sx={{ minWidth: 180 }}>
        <MenuItem value="availability">Availability</MenuItem><MenuItem value="create">Create proposal</MenuItem>
      </TextField>}
    </Stack>
    {system === 'one' && onePrompt !== 'routing' && <Alert severity="info">Tests against fixed sample proposal: 60-minute massage tomorrow at 10:00.</Alert>}
    {system === 'two' && twoPrompt === 'booking-planner' && <Alert severity="info">Uses sample schedule tomorrow at 10:00, 12:00, and 14:00 with no busy Calendar times. Output is not real availability.</Alert>}
    <TextField label="Example text" value={example} onChange={(event) => { setExample(event.target.value); test.reset(); }} multiline minRows={4} fullWidth disabled={test.isPending} inputProps={{ maxLength: 4_000 }} helperText={`${example.length.toLocaleString()} / 4,000 characters`} />
    <Button variant="contained" onClick={run} disabled={!example.trim() || test.isPending} sx={{ alignSelf: 'flex-start' }}>{test.isPending ? 'Running…' : 'Run test'}</Button>
    {test.isError && <Alert severity="error">{test.error instanceof Error ? test.error.message : 'Prompt test failed.'}</Alert>}
    {test.data && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={1}>
      <Typography variant="subtitle1">{test.data.kind === 'tool_calls' ? 'Requested tools (not executed)' : 'Output'}</Typography>
      {test.data.sampleContext && <Typography variant="body2" color="text.secondary">Sample context used.</Typography>}
      <Typography component="pre" variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', m: 0 }}>{test.data.output}</Typography>
    </Stack></Paper>}
  </Stack>;
};
