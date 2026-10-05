import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi } from './api.js';
import { useI18n } from "./i18n.js";

function ClearContextButton({ chatId }: { chatId: string }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [clearedMessages, setClearedMessages] = useState<number>();
  const clear = useMutation({
    mutationFn: () => adminApi.clearConversationContext(chatId),
    onSuccess: async (result) => { setClearedMessages(result.clearedMessages); await client.invalidateQueries({ queryKey: ['conversations'] }); },
  });
  return <Stack spacing={0.5}>
    <Button color="error" disabled={clear.isPending} onClick={() => clear.mutate()}>{t("Clear context")}</Button>
    {clearedMessages !== undefined && <Typography variant="body2" role="status">{t("Context cleared.")}{t(" ")}{clearedMessages} {t(" ")}{t("messages removed.")}</Typography>}
    {clear.isError && <Alert severity="error">{t("Could not clear context.")}</Alert>}
  </Stack>;
}

function RequestCard({ request, telegramUsername }: { request: Awaited<ReturnType<typeof adminApi.humanRequests>>[number]; telegramUsername?: string | null }) {
  const { t, language } = useI18n();
  const client = useQueryClient();
  const [text, setText] = useState('');
  const reply = useMutation({ mutationFn: () => adminApi.replyHumanRequest(request.id, text.trim()), onSuccess: async () => { setText(''); await client.invalidateQueries({ queryKey: ['human-requests'] }); } });
  const release = useMutation({ mutationFn: () => adminApi.releaseHumanRequest(request.id), onSuccess: async () => client.invalidateQueries({ queryKey: ['human-requests'] }) });
  return <Card variant="outlined"><CardContent><Stack spacing={1.5}>
    <Typography variant="subtitle1">{t("Request")}{t(" ")}{request.id} · {t(request.status)}</Typography>
    <Typography variant="body2">{telegramUsername ? `${t("Client")}: @${telegramUsername} · ${t("chat")}: ${request.telegramChatId}` : `${t("Client chat")}: ${request.telegramChatId}`} · {new Date(request.createdAt).toLocaleString(language === "uk" ? "uk-UA" : "en-US")} · {t(request.reason)}{request.probability === undefined ? t("") : ` · ${t("Probability")} ${Math.round(request.probability * 100)}%`}</Typography>
    <Typography>{request.question}</Typography>
    {request.queuedMessages.map((message, index) => <Typography key={index} variant="body2">{t("Follow-up:")}{t(" ")}{message}</Typography>)}
    {request.lastAnswer && <Typography variant="body2">{t("Last human answer:")}{t(" ")}{request.lastAnswer}</Typography>}
    <Typography variant="body2">{t("Responder delivery:")}{t(" ")}{Object.entries(request.notifications).map(([name, status]) => `${name}: ${t(status)}`).join(', ') || t("none")}</Typography>
    {request.status === 'uncertain' && <Alert severity="warning">{t("Delivery may have succeeded. Check Telegram before releasing request.")}</Alert>}
    {request.status === 'open' && <><TextField label={t("Reply to request {id}", { id: request.id })} multiline minRows={2} value={text} onChange={(event) => setText(event.target.value)} inputProps={{ maxLength: 4000 }} />
      <Button variant="contained" disabled={!text.trim() || reply.isPending} onClick={() => reply.mutate()}>{t("Send human reply")}</Button></>}
    <Stack direction="row" spacing={1} flexWrap="wrap">
      <Button color="warning" disabled={release.isPending || request.status === 'sending'} onClick={() => release.mutate()}>{t("Release request")}</Button>
      <ClearContextButton chatId={request.telegramChatId} />
    </Stack>
    {(reply.isError || release.isError) && <Alert severity="error">{t("Action failed. Refresh request status.")}</Alert>}
  </Stack></CardContent></Card>;
}

export function Conversations() {
  const { t } = useI18n();
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: adminApi.conversations });
  const requests = useQuery({ queryKey: ['human-requests'], queryFn: adminApi.humanRequests });
  const usernameByChatId = new Map((conversations.data ?? []).map((conversation) => [conversation.telegramChatId, conversation.telegramUsername]));
  return <Stack spacing={2}>
    <Typography variant="h6">{t("Human requests")}</Typography>
    <Button onClick={() => { void requests.refetch(); void conversations.refetch(); }}>{t("Refresh")}</Button>
    {requests.isPending && <Typography>{t("Loading requests…")}</Typography>}
    {requests.isError && <Alert severity="error">{t("Could not load human requests.")}</Alert>}
    {requests.data?.length === 0 && <Typography>{t("No open requests.")}</Typography>}
    {requests.data?.map((request) => <RequestCard key={request.id} request={request} telegramUsername={usernameByChatId.get(request.telegramChatId)} />)}
    <Typography variant="h6">{t("Conversations")}</Typography>
    <Typography variant="body2">{t("Clear context removes stored chat messages and pending proposals. The next assistant reply starts fresh; bookings and human requests stay. Previously submitted OpenAI records and owner-only diagnostics remain.")}</Typography>
    {conversations.isPending && <Typography>{t("Loading conversations…")}</Typography>}
    {conversations.isError && <Alert severity="error">{t("Could not load conversations.")}</Alert>}
    {conversations.data?.map((conversation) => <Card key={conversation.telegramChatId} variant="outlined"><CardContent><Stack spacing={1}><Typography>{conversation.telegramChatId}</Typography><Typography variant="body2">{t("Telegram username:")}{t(" ")}{conversation.telegramUsername ? `@${conversation.telegramUsername}` : t("unavailable")}</Typography><Typography variant="body2">{t("Assistant:")}{t(" ")}{conversation.assistantEnabled ? t("enabled") : t("disabled")} {t(" ")}{t("· Human request:")}{t(" ")}{conversation.activeHumanRequestId ?? t("none")}</Typography><ClearContextButton chatId={conversation.telegramChatId} /></Stack></CardContent></Card>)}
  </Stack>;
}
