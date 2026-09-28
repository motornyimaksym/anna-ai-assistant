import type { DebugRequest } from '@booking/contracts';
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { adminApi } from './api.js';

const useDebugAccess = (uid: string) => useQuery({ queryKey: ['debug-access', uid], queryFn: adminApi.debugAccess, retry: false, staleTime: 0 });
export const DebugLink = ({ uid }: { uid: string }) => {
  const access = useDebugAccess(uid);
  return access.data?.canView ? <Button color="inherit" component={NavLink} to="/debug">Debug</Button> : null;
};
export const DebugLogs = ({ uid }: { uid: string }) => {
  const queryClient = useQueryClient();
  const access = useDebugAccess(uid);
  const [tab, setTab] = useState<'log' | 'test'>('log');
  const [filter, setFilter] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const logs = useQuery({ queryKey: ['debug-logs', uid], queryFn: adminApi.debugLogs, enabled: access.data?.canView === true && tab === 'log', retry: false, gcTime: 0 });
  const clearLogs = useMutation({ mutationFn: adminApi.clearDebugLogs, onSuccess: async () => { setConfirmClear(false); await queryClient.invalidateQueries({ queryKey: ['debug-logs', uid] }); } });
  if (access.isPending) return <Typography>Checking access…</Typography>;
  if (access.isError || !access.data?.canView) return <Alert severity="warning">Debug tools are available only to the designated owner account.</Alert>;
  return <Stack spacing={2}>
    <Tabs value={tab} onChange={(_, value: 'log' | 'test') => setTab(value)} aria-label="Debug sections">
      <Tab value="log" label="System log" />
      <Tab value="test" label="Prompt test" />
    </Tabs>
    {tab === 'test' ? <PromptTest /> : <>
    <Typography variant="body2">Latest 200 records retained globally. Complete sanitized AI request and response bodies load when expanded. Credentials and hidden reasoning are excluded. Older records are deleted automatically.</Typography>
    <Stack direction="row" spacing={2}>
      <TextField label="Filter stage, status or trace" value={filter} onChange={(event) => setFilter(event.target.value)} fullWidth size="small" />
      <Button onClick={() => void logs.refetch()} disabled={logs.isFetching || clearLogs.isPending}>Refresh</Button>
      <Button color="error" onClick={() => { clearLogs.reset(); setConfirmClear(true); }} disabled={logs.isFetching || clearLogs.isPending || !logs.data?.length}>Clear</Button>
    </Stack>
    {logs.isPending && <Typography>Loading logs…</Typography>}
    {logs.isError && <Alert severity="error">Could not load debug logs.</Alert>}
    {logs.data?.length === 0 && <Alert severity="info">No diagnostic events yet.</Alert>}
    {logs.data?.filter((event) => JSON.stringify(event).toLowerCase().includes(filter.toLowerCase())).map((event) => <Paper key={event.id} variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label={event.level} color={event.level === 'error' ? 'error' : event.level === 'warn' ? 'warning' : 'default'} /><Typography fontWeight="bold">{event.stage}</Typography><Typography variant="body2">{new Date(event.createdAt).toLocaleString()}</Typography></Stack>
      <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>Trace: {event.traceId} · Chat reference: {event.chatRef}</Typography>
      <Typography component="pre" variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', mb: 0 }}>{JSON.stringify({ ...event.details, request: undefined }, null, 2)}</Typography>
      {event.details.request && <RequestDetails eventId={event.id} request={event.details.request} />}
    </Paper>)}
    </>}
    <Dialog open={confirmClear} onClose={() => { if (!clearLogs.isPending) setConfirmClear(false); }}>
      <DialogTitle>Clear system log?</DialogTitle>
      <DialogContent><Typography>Clear all currently retained diagnostic events? Their private request/response payloads will no longer be accessible.</Typography>{clearLogs.isError && <Alert severity="error" sx={{ mt: 2 }}>Could not clear debug logs. Please try again.</Alert>}</DialogContent>
      <DialogActions><Button disabled={clearLogs.isPending} onClick={() => setConfirmClear(false)}>Cancel</Button><Button color="error" disabled={clearLogs.isPending} onClick={() => clearLogs.mutate()}>{clearLogs.isPending ? 'Clearing…' : 'Clear log'}</Button></DialogActions>
    </Dialog>
  </Stack>;
};

const RequestDetails = ({ eventId, request }: { eventId: string; request: DebugRequest }) => {
  const [requestOpen, setRequestOpen] = useState(false);
  const [responseOpen, setResponseOpen] = useState(false);
  const legacy = request.bodyStorageStatus === undefined;
  const payload = useQuery({ queryKey: ['debug-payload', eventId], queryFn: () => adminApi.debugLogPayload(eventId), enabled: (requestOpen || responseOpen) && !legacy && request.bodyStorageStatus !== 'unavailable', retry: false, gcTime: 0 });
  const { requestPreview, responsePreview, requestTruncated, responseTruncated, ...metadata } = request;
  const renderBody = (kind: 'request' | 'response') => {
    const opened = kind === 'request' ? requestOpen : responseOpen;
    if (!opened) return null;
    if (legacy) {
      const body = kind === 'request' ? requestPreview : responsePreview;
      const truncated = kind === 'request' ? requestTruncated : responseTruncated;
      return body === undefined ? <Typography variant="body2">No legacy payload available.</Typography> : <><Typography variant="caption">Legacy preview{truncated ? ' (truncated)' : ''}</Typography><Typography component="pre" variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{body}</Typography></>;
    }
    if (request.bodyStorageStatus === 'unavailable') return <Typography variant="body2">Payload storage unavailable.</Typography>;
    if (payload.isPending) return <Typography variant="body2">Loading complete payload…</Typography>;
    if (payload.isError || !payload.data || payload.data.status === 'unavailable') return <Typography variant="body2">Payload unavailable.</Typography>;
    const body = kind === 'request' ? payload.data.requestBody : payload.data.responseBody;
    return body === undefined ? <Typography variant="body2">No response body received.</Typography> : <Typography component="pre" variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{body}</Typography>;
  };
  return <Stack spacing={1} sx={{ mt: 1 }}>
    <Typography fontWeight="bold">{request.provider} · {request.operation}</Typography>
    <Typography variant="body2">{request.method} {request.endpoint} · {request.durationMs} ms · {request.attempts} HTTP attempts</Typography>
    <Typography variant="body2">Conversation: {request.conversationAttached ? request.conversationId : 'isolated'} · Model: {request.model ?? 'not applicable'} · Status: {request.responseStatus ?? request.httpStatus ?? request.errorCategory ?? 'unknown'}</Typography>
    <details><summary>Request metadata</summary><Typography component="pre" variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(metadata, null, 2)}</Typography></details>
    <details open={requestOpen}><summary onClick={(event) => { event.preventDefault(); setRequestOpen((open) => !open); }}>Request body</summary>{renderBody('request')}</details>
    <details open={responseOpen}><summary onClick={(event) => { event.preventDefault(); setResponseOpen((open) => !open); }}>Response body</summary>{renderBody('response')}</details>
  </Stack>;
};

const onePrompts = [{ value: 'handoff', label: 'Handoff' }] as const;
const twoPrompts = [{ value: 'assistant', label: 'Assistant' }] as const;
const PromptTest = () => {
  const [system, setSystem] = useState<'one' | 'two'>('one');
  const [onePrompt, setOnePrompt] = useState<(typeof onePrompts)[number]['value']>('handoff');
  const [twoPrompt, setTwoPrompt] = useState<(typeof twoPrompts)[number]['value']>('assistant');
  const [example, setExample] = useState('');
  const test = useMutation({ mutationFn: adminApi.promptTest });
  const promptId = system === 'one' ? onePrompt : twoPrompt;
  const run = () => {
    if (system === 'one') test.mutate({ system, promptId: onePrompt, text: example });
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
    </Stack>
    {system === 'one' && <Alert severity="info">Uses a sample recent reply, your example as the client message, and an unsent draft. The score measures whether the draft sounds automated; copied text alone is not proof.</Alert>}
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
