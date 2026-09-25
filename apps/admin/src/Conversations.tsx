import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi } from './api.js';

function RequestCard({ request }: { request: Awaited<ReturnType<typeof adminApi.humanRequests>>[number] }) {
  const client = useQueryClient();
  const [text, setText] = useState('');
  const reply = useMutation({ mutationFn: () => adminApi.replyHumanRequest(request.id, text.trim()), onSuccess: async () => { setText(''); await client.invalidateQueries({ queryKey: ['human-requests'] }); } });
  const release = useMutation({ mutationFn: () => adminApi.releaseHumanRequest(request.id), onSuccess: async () => client.invalidateQueries({ queryKey: ['human-requests'] }) });
  return <Card variant="outlined"><CardContent><Stack spacing={1.5}>
    <Typography variant="subtitle1">Request {request.id} · {request.status}</Typography>
    <Typography variant="body2">Client chat: {request.telegramChatId} · {request.createdAt} · {request.reason}{request.probability === undefined ? '' : ` · Jev ${Math.round(request.probability * 100)}%`}</Typography>
    <Typography>{request.question}</Typography>
    {request.queuedMessages.map((message, index) => <Typography key={index} variant="body2">Follow-up: {message}</Typography>)}
    {request.lastAnswer && <Typography variant="body2">Last human answer: {request.lastAnswer}</Typography>}
    <Typography variant="body2">Responder delivery: {Object.entries(request.notifications).map(([name, status]) => `${name}: ${status}`).join(', ') || 'none'} · Client acknowledgment: {request.acknowledgement}</Typography>
    {request.status === 'uncertain' && <Alert severity="warning">Delivery may have succeeded. Check Telegram before releasing request.</Alert>}
    {request.status === 'open' && <><TextField label={`Reply to request ${request.id}`} multiline minRows={2} value={text} onChange={(event) => setText(event.target.value)} inputProps={{ maxLength: 4000 }} />
      <Button variant="contained" disabled={!text.trim() || reply.isPending} onClick={() => reply.mutate()}>Send human reply</Button></>}
    <Button color="warning" disabled={release.isPending || request.status === 'sending'} onClick={() => release.mutate()}>Release request</Button>
    {(reply.isError || release.isError) && <Alert severity="error">Action failed. Refresh request status.</Alert>}
  </Stack></CardContent></Card>;
}

export function Conversations() {
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: adminApi.conversations });
  const requests = useQuery({ queryKey: ['human-requests'], queryFn: adminApi.humanRequests });
  return <Stack spacing={2}>
    <Typography variant="h6">Human requests</Typography>
    <Button onClick={() => { void requests.refetch(); void conversations.refetch(); }}>Refresh</Button>
    {requests.isPending && <Typography>Loading requests…</Typography>}
    {requests.isError && <Alert severity="error">Could not load human requests.</Alert>}
    {requests.data?.length === 0 && <Typography>No open requests.</Typography>}
    {requests.data?.map((request) => <RequestCard key={request.id} request={request} />)}
    <Typography variant="h6">Conversations</Typography>
    {conversations.isPending && <Typography>Loading conversations…</Typography>}
    {conversations.isError && <Alert severity="error">Could not load conversations.</Alert>}
    {conversations.data?.map((conversation) => <Card key={conversation.telegramChatId} variant="outlined"><CardContent><Typography>{conversation.telegramChatId}</Typography><Typography variant="body2">Assistant: {conversation.assistantEnabled ? 'enabled' : 'disabled'} · Human request: {conversation.activeHumanRequestId ?? 'none'}</Typography></CardContent></Card>)}
  </Stack>;
}
