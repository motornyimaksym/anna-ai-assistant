import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Container, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { adminApi } from './api.js';
import { signIn } from './auth.js';
// Capture only in memory; strip transient OAuth data before rendering or API calls.
const params = new URLSearchParams(window.location.search);
const callback: { state: string; code?: string; denied?: boolean } = { state: params.get('state') ?? '', ...(params.has('error') ? { denied: true } : { code: params.get('code') ?? '' }) };
if (window.location.pathname === '/google-calendar/callback') window.history.replaceState({}, '', '/google-calendar/callback');
export function GoogleCalendarCallback({ user }: { user: User | null }) {
  const started = useRef(false); const [message, setMessage] = useState('Finishing Google authorization…'); const [failed, setFailed] = useState(false); const [done, setDone] = useState(false);
  useEffect(() => {
    if (!user || started.current) return; started.current = true;
    if (!callback.state || (!callback.code && !callback.denied)) { setFailed(true); setDone(true); setMessage('Authorization details are missing. Start again from Bot Settings.'); return; }
    void adminApi.completeGoogleCalendar(callback).then((status) => {
      setMessage(status.phase === 'connected' ? 'Google account connected. Return to Settings and select the calendar to use.' : 'Google authorization was cancelled. You can try again from Settings.'); setDone(true);
    }).catch((error: unknown) => { setMessage(error instanceof Error ? error.message : 'Authorization failed. Start again from Settings.'); setFailed(true); setDone(true); });
  }, [user]);
  return <Container maxWidth="sm" sx={{ mt: 8 }}><Typography variant="h4" gutterBottom>Google Calendar connection</Typography>
    {!user ? <><Typography>Sign in with the same admin owner account that started this connection.</Typography><Button onClick={() => void signIn().catch(() => { setFailed(true); setMessage('Sign-in failed. Please try again.'); })}>Sign in as owner</Button>{failed && <Alert severity="error">{message}</Alert>}</> : <Alert severity={failed ? 'error' : done ? 'success' : 'info'}>{message}</Alert>}
    <Button component={Link} to="/bot-settings" sx={{ mt: 2 }}>Return to Bot Settings</Button>
  </Container>;
}
