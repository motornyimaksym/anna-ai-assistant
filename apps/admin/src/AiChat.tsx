import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Container, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { signOut, type User } from 'firebase/auth';
import type { AiChatThread } from '@booking/contracts';
import { auth, signIn } from './auth.js';
import { aiChatApi } from './api.js';

export function AiChatEntry({ user }: { user: User | null }) {
  const [error, setError] = useState('');
  if (user) return <AiChat key={user.uid} uid={user.uid} />;
  return <Container maxWidth="sm" sx={{ pt: 12 }}><Typography variant="h3">Your AI workspace</Typography><Typography sx={{ my: 3 }}>A private place to think, search Telegram, and draft messages. Access is managed by the owner.</Typography>{error && <Alert severity="error">{error}</Alert>}<Button variant="contained" onClick={() => void signIn().catch(() => setError('Sign-in failed. Please try again.'))}>Sign in with Google</Button></Container>;
}

export function AiChat({ uid }: { uid: string }) {
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const id = params.get('thread') ?? '';
  const [draft, setDraft] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const threads = useQuery({ queryKey: ['ai-threads', uid], queryFn: aiChatApi.threads, retry: false });
  const thread = useQuery({ queryKey: ['ai-thread', uid, id], queryFn: () => aiChatApi.thread(id), enabled: !!id && threads.isSuccess, retry: false });
  const update = (data: AiChatThread) => {
    cache.setQueryData(['ai-thread', uid, data.id], data);
    void cache.invalidateQueries({ queryKey: ['ai-threads', uid] });
  };
  const create = useMutation({ mutationFn: aiChatApi.create, onSuccess: (data) => { update(data); setParams({ thread: data.id }); setDraft(''); } });
  const send = useMutation({ mutationFn: ({ threadId, text }: { threadId: string; text: string }) => aiChatApi.message(threadId, text), onSuccess: (data) => { update(data); setDraft(''); } });
  const action = useMutation({ mutationFn: ({ threadId, actionId, confirm }: { threadId: string; actionId: string; confirm: boolean }) => aiChatApi.action(threadId, actionId, confirm), onSuccess: update, onError: () => { void cache.invalidateQueries({ queryKey: ['ai-thread', uid, id] }); } });
  const busy = create.isPending || send.isPending || action.isPending;
  useEffect(() => { bottom.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [thread.data?.messages.length, busy]);
  const error = create.error ?? send.error ?? action.error;
  const proposal = thread.data?.action;
  const submit = () => { if (draft.trim() && !busy && thread.data) send.mutate({ threadId: id, text: draft.trim() }); };
  const changeThread = (next: string) => { setParams({ thread: next }); setDraft(''); send.reset(); action.reset(); };
  return <Box sx={{ display: 'flex', height: '100dvh', bgcolor: '#fafafa', flexDirection: { xs: 'column', md: 'row' } }}>
    <Box component="aside" aria-label="Chat history" sx={{ width: { xs: '100%', md: 260 }, bgcolor: '#f0f0f0', p: 2, display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0, maxHeight: { xs: '28vh', md: '100%' } }}>
      <Typography variant="h6">AI workspace</Typography>
      <Button variant="outlined" disabled={busy || !threads.isSuccess} onClick={() => create.mutate()}>New chat</Button>
      <Box sx={{ overflowY: 'auto', flex: 1 }}>{threads.data?.map((item) => <Button key={item.id} fullWidth disabled={busy} variant={item.id === id ? 'contained' : 'text'} sx={{ justifyContent: 'flex-start', textTransform: 'none', mb: .5 }} onClick={() => changeThread(item.id)}>{item.title}</Button>)}</Box>
      <Button onClick={() => void signOut(auth).then(() => cache.clear()).catch(() => setSignOutError('Sign-out failed. Please try again.'))}>Sign out</Button>
      {signOutError && <Alert severity="error">{signOutError}</Alert>}
    </Box>
    <Box component="main" sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 3, py: 2, borderBottom: '1px solid #e5e5e5' }}><Typography variant="h6">{thread.data?.title ?? 'Private AI chat'}</Typography><Typography variant="caption">Connected owner’s Telegram account · Reads automatic · Sends require confirmation</Typography></Box>
      <Container maxWidth="md" sx={{ flex: 1, overflowY: 'auto', py: 3 }}>
        {threads.isLoading && <CircularProgress aria-label="Checking access" />}
        {threads.isError && <Alert severity="error">Workspace unavailable. Sign in with the owner account or a verified email listed in stakeholder settings, then retry.<Button onClick={() => void threads.refetch()}>Retry</Button></Alert>}
        {threads.isSuccess && !id && <Box sx={{ textAlign: 'center', mt: 8 }}><Typography variant="h4">What would you like to work on?</Typography><Typography sx={{ mt: 2 }}>Start a new chat to search Telegram, summarize a conversation, or draft a reply.</Typography></Box>}
        {thread.isLoading && id && <CircularProgress aria-label="Loading conversation" />}
        {thread.isError && <Alert severity="error">Could not load this chat.<Button onClick={() => void thread.refetch()}>Retry</Button></Alert>}
        <Stack spacing={3}>{thread.data?.messages.map((message, index) => <Box key={index} sx={{ alignSelf: message.role === 'user' ? 'flex-end' : 'stretch', maxWidth: '100%' }}>
          <Typography variant="caption" color="text.secondary">{message.role === 'user' ? 'You' : 'Assistant'}</Typography>
          <Box sx={{ bgcolor: message.role === 'user' ? '#e9ecef' : 'transparent', p: 2, borderRadius: 3, overflowWrap: 'anywhere', '& pre': { overflowX: 'auto' } }}>
            {message.role === 'user' ? <Typography sx={{ whiteSpace: 'pre-wrap' }}>{message.text}</Typography> : <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: ({ alt }) => <span>{alt}</span>, a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{message.text}</ReactMarkdown>}
          </Box>
        </Box>)}</Stack>
        {proposal && <Paper variant="outlined" sx={{ p: 2, mt: 3 }}>
          <Typography variant="h6">{proposal.tool === 'reply_to_message' ? 'Reply preview' : 'Message preview'}</Typography>
          <Typography>To: {proposal.chatTitle} ({proposal.chatId})</Typography>
          {proposal.messageId && <Typography>Reply to message: {proposal.messageId}</Typography>}
          <Divider sx={{ my: 1 }} /><Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{proposal.text}</Typography><Divider sx={{ my: 1 }} />
          <Typography variant="caption">Status: {proposal.status} · Expires: {new Date(proposal.expiresAt).toLocaleString()}</Typography>
          {proposal.status === 'pending' && <Stack direction="row" spacing={1} sx={{ mt: 2 }}><Button variant="contained" disabled={busy || Date.parse(proposal.expiresAt) <= Date.now()} onClick={() => action.mutate({ threadId: id, actionId: proposal.id, confirm: true })}>Confirm send</Button><Button disabled={busy} onClick={() => action.mutate({ threadId: id, actionId: proposal.id, confirm: false })}>Cancel</Button></Stack>}
          {(proposal.status === 'uncertain' || proposal.status === 'sending') && <Alert severity="warning" sx={{ mt: 1 }}>Delivery is not confirmed. Check Telegram before creating another send.</Alert>}
        </Paper>}
        {busy && <Typography role="status" sx={{ mt: 2 }}>{action.isPending ? 'Processing your choice…' : 'Working…'}</Typography>}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error.message}</Alert>}
        <div ref={bottom} />
      </Container>
      {threads.isSuccess && thread.data && <Container maxWidth="md" sx={{ pb: 2 }}><Box component="form" onSubmit={(event) => { event.preventDefault(); submit(); }} sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
        <TextField fullWidth multiline maxRows={6} label="Message your assistant" value={draft} disabled={busy} slotProps={{ htmlInput: { maxLength: 4000 } }} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
        <Button type="submit" variant="contained" disabled={busy || !draft.trim()}>Send prompt</Button>
      </Box><Typography variant="caption" color="text.secondary">AI can make mistakes. Review recipients and message text before confirming. A new prompt replaces any pending proposal.</Typography></Container>}
    </Box>
  </Box>;
}
