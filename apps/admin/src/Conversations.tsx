import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi } from './api.js';

function ClearContextButton({ chatId }: { chatId: string }) {
  const client = useQueryClient();
  const [clearedMessages, setClearedMessages] = useState<number>();
  const clear = useMutation({
    mutationFn: () => adminApi.clearConversationContext(chatId),
    onSuccess: async (result) => { setClearedMessages(result.clearedMessages); await client.invalidateQueries({ queryKey: ['conversations'] }); },
  });
  return <Stack spacing={0.5}>
    <Button color="error" disabled={clear.isPending} onClick={() => clear.mutate()}>Clear context</Button>
    {clearedMessages !== undefined && <Typography variant="body2" role="status">Context cleared. {clearedMessages} messages removed.</Typography>}
    {clear.isError && <Alert severity="error">Could not clear context.</Alert>}
  </Stack>;
}

function RequestCard({ request, telegramUsername }: { request: Awaited<ReturnType<typeof adminApi.humanRequests>>[number]; telegramUsername?: string | null }) {
  const client = useQueryClient();
  const [text, setText] = useState('');
  const reply = useMutation({ mutationFn: () => adminApi.replyHumanRequest(request.id, text.trim()), onSuccess: async () => { setText(''); await client.invalidateQueries({ queryKey: ['human-requests'] }); } });
  const release = useMutation({ mutationFn: () => adminApi.releaseHumanRequest(request.id), onSuccess: async () => client.invalidateQueries({ queryKey: ['human-requests'] }) });
  return <Card variant="outlined"><CardContent><Stack spacing={1.5}>
    <Typography variant="subtitle1">Request {request.id} · {request.status}</Typography>
    <Typography variant="body2">{telegramUsername ? `Client: @${telegramUsername} · chat: ${request.telegramChatId}` : `Client chat: ${request.telegramChatId}`} · {request.createdAt} · {request.reason}{request.probability === undefined ? '' : ` · Probability ${Math.round(request.probability * 100)}%`}</Typography>
    <Typography>{request.question}</Typography>
    {request.queuedMessages.map((message, index) => <Typography key={index} variant="body2">Follow-up: {message}</Typography>)}
    {request.lastAnswer && <Typography variant="body2">Last human answer: {request.lastAnswer}</Typography>}
    <Typography variant="body2">Responder delivery: {Object.entries(request.notifications).map(([name, status]) => `${name}: ${status}`).join(', ') || 'none'}</Typography>
    {request.status === 'uncertain' && <Alert severity="warning">Delivery may have succeeded. Check Telegram before releasing request.</Alert>}
    {request.status === 'open' && <><TextField label={`Reply to request ${request.id}`} multiline minRows={2} value={text} onChange={(event) => setText(event.target.value)} inputProps={{ maxLength: 4000 }} />
      <Button variant="contained" disabled={!text.trim() || reply.isPending} onClick={() => reply.mutate()}>Send human reply</Button></>}
    <Stack direction="row" spacing={1} flexWrap="wrap">
      <Button color="warning" disabled={release.isPending || request.status === 'sending'} onClick={() => release.mutate()}>Release request</Button>
      <ClearContextButton chatId={request.telegramChatId} />
    </Stack>
    {(reply.isError || release.isError) && <Alert severity="error">Action failed. Refresh request status.</Alert>}
  </Stack></CardContent></Card>;
}

export function Conversations() {
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: adminApi.conversations });
  const requests = useQuery({ queryKey: ['human-requests'], queryFn: adminApi.humanRequests });
  const usernameByChatId = new Map((conversations.data ?? []).map((conversation) => [conversation.telegramChatId, conversation.telegramUsername]));
  return <Stack spacing={2}>
    <Typography variant="h6">Human requests</Typography>
    <Button onClick={() => { void requests.refetch(); void conversations.refetch(); }}>Refresh</Button>
    {requests.isPending && <Typography>Loading requests…</Typography>}
    {requests.isError && <Alert severity="error">Could not load human requests.</Alert>}
    {requests.data?.length === 0 && <Typography>No open requests.</Typography>}
    {requests.data?.map((request) => <RequestCard key={request.id} request={request} telegramUsername={usernameByChatId.get(request.telegramChatId)} />)}
    <Typography variant="h6">Conversations</Typography>
    <Typography variant="body2">Clear context removes stored chat messages and pending proposals. The next assistant reply starts fresh; bookings and human requests stay. Previously submitted OpenAI records and owner-only diagnostics remain.</Typography>
    {conversations.isPending && <Typography>Loading conversations…</Typography>}
    {conversations.isError && <Alert severity="error">Could not load conversations.</Alert>}
    {conversations.data?.map((conversation) => <Card key={conversation.telegramChatId} variant="outlined"><CardContent><Stack spacing={1}><Typography>{conversation.telegramChatId}</Typography><Typography variant="body2">Telegram username: {conversation.telegramUsername ? `@${conversation.telegramUsername}` : 'unavailable'}</Typography><Typography variant="body2">Assistant: {conversation.assistantEnabled ? 'enabled' : 'disabled'} · Human request: {conversation.activeHumanRequestId ?? 'none'}</Typography><ClearContextButton chatId={conversation.telegramChatId} /></Stack></CardContent></Card>)}
  </Stack>;
}
