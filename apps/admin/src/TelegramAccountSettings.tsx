import { Alert, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { telegramAccountCodeSchema, telegramAccountPasswordSchema, telegramAccountStartSchema, type TelegramAccountStatus } from '@booking/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi } from './api.js';
const queryKey = ['telegram-account'];

export function TelegramAccountSettings() {
  const client = useQueryClient();
  const query = useQuery({ queryKey, queryFn: adminApi.telegramAccount, retry: false, staleTime: 0, gcTime: 0 });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Keep credentials out of React Query's mutation cache and browser storage.
  const act = async (action: 'start' | 'code' | 'password' | 'check' | 'disconnect') => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    const data = action === 'start' ? { phone } : action === 'code' ? { code } : action === 'password' ? { password } : undefined;
    setCode(''); setPassword('');
    try {
      const result: TelegramAccountStatus = await adminApi.telegramAccountAction(action, data);
      client.setQueryData(queryKey, result);
      if (result.phase === 'connected') { setPhone(''); setConsent(false); setNotice(action === 'check' ? 'Telegram connection verified.' : 'Telegram account connected.'); }
      if (action === 'disconnect') { setPhone(''); setConsent(false); setNotice('Telegram account disconnected.'); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Telegram request failed.');
      await query.refetch();
    } finally { setBusy(false); }
  };
  return <Stack spacing={1.5}>
    <Typography variant="h6">Telegram account</Typography>
    <Typography variant="body2">Connect your account for a read-only schedule import. On incoming Telegram messages, the app reads the five newest text messages from the matching schedule group at most once every five minutes. This is separate from the Business bot; it never sends messages or marks chats read.</Typography>
    {query.isPending && <Typography>Loading Telegram connection…</Typography>}
    {query.isError && <Alert severity="error">Could not load Telegram connection. <Button onClick={() => void query.refetch()}>Retry</Button></Alert>}
    {query.data && <>
      {!query.data.configured && <Alert severity="warning">Telegram account connection is not configured. Contact the administrator.</Alert>}
      <Typography>Status: {query.data.phase}{query.data.maskedPhone ? ` · ${query.data.maskedPhone}` : ''}{query.data.username ? ` · @${query.data.username}` : ''}</Typography>
      {query.data.configured && query.data.phase === 'disconnected' && <>
        <TextField label="Telegram phone number" type="tel" autoComplete="tel" placeholder="+380…" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
        <FormControlLabel control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />} label="I authorize read-only access to the schedule chat's latest five text messages. Refresh runs at most once every five minutes. This app never sends messages or marks chats read. I can revoke the session here or in Telegram Settings → Devices." />
        <Button variant="contained" disabled={busy || !consent || !telegramAccountStartSchema.safeParse({ phone }).success} onClick={() => void act('start')}>Send login code</Button>
      </>}
      {query.data.configured && query.data.phase === 'code' && <>
        <TextField label="Telegram login code" value={code} inputProps={{ inputMode: 'numeric', maxLength: 8 }} autoComplete="one-time-code" helperText="Check Telegram or SMS for the code. Login expires after 10 minutes." onChange={(e) => setCode(e.target.value)} disabled={busy} />
        <Button variant="contained" disabled={busy || !telegramAccountCodeSchema.safeParse({ code }).success} onClick={() => void act('code')}>Verify code</Button>
      </>}
      {query.data.configured && query.data.phase === 'password' && <>
        <TextField label="Telegram account password" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} helperText="Enter your personal Telegram account password set for two-step verification, not the one-time login code. Used only for this login; never saved." />
        <Button variant="contained" disabled={busy || !telegramAccountPasswordSchema.safeParse({ password }).success} onClick={() => void act('password')}>Authorize account</Button>
      </>}
      {query.data.configured && query.data.phase === 'connected' && <Button disabled={busy} onClick={() => void act('check')}>Check connection</Button>}
      {query.data.configured && query.data.phase !== 'disconnected' && <Button color="warning" disabled={busy} onClick={() => void act('disconnect')}>{query.data.phase === 'connected' ? 'Disconnect Telegram account' : 'Cancel login'}</Button>}
    </>}
    {busy && <Typography>Contacting Telegram…</Typography>}
    {error && <Alert severity="error">{error}</Alert>}
    {notice && <Alert severity="success">{notice}</Alert>}
  </Stack>;
}
