import { useEffect, useRef, useState } from 'react';
import {
  AccountCircleOutlined,
  CalendarMonthRounded,
  CheckCircleRounded,
  ErrorOutlineRounded,
  InfoOutlined,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { adminApi } from './api.js';
import { AdminAppearance, ThemeToggle } from './AdminAppearance.js';
import { signIn } from './auth.js';
import { LanguageToggle, useI18n } from './i18n.js';

// Capture only in memory; strip transient OAuth data before rendering or API calls.
const params = new URLSearchParams(window.location.search);
const callback: { state: string; code?: string; denied?: boolean } = {
  state: params.get('state') ?? '',
  ...(params.has('error') ? { denied: true } : { code: params.get('code') ?? '' }),
};
if (window.location.pathname === '/google-calendar/callback') {
  window.history.replaceState({}, '', '/google-calendar/callback');
}

type CallbackStatus = 'pending' | 'connected' | 'cancelled' | 'error';

export function GoogleCalendarCallback({ user }: { user: User | null }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const started = useRef(false);
  const [status, setStatus] = useState<CallbackStatus>('pending');
  const [message, setMessage] = useState('Finishing Google authorization…');
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    if (!callback.state || (!callback.code && !callback.denied)) {
      setStatus('error');
      setMessage('Authorization details are missing. Start again from Bot Settings.');
      return;
    }
    void adminApi.completeGoogleCalendar(callback).then((result) => {
      if (callback.denied || result.phase === 'disconnected') {
        setStatus('cancelled');
        setMessage('Google authorization was cancelled. You can try again from Settings.');
        return;
      }
      if (result.phase !== 'connected') {
        setStatus('error');
        setMessage('Authorization could not be completed. Start again from Settings.');
        return;
      }
      setSecondsRemaining(5);
      setStatus('connected');
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Authorization failed. Start again from Settings.');
      setStatus('error');
    });
  }, [user]);

  useEffect(() => {
    if (status !== 'connected') return;
    const countdown = window.setInterval(() => {
      setSecondsRemaining((current) => current === null ? null : Math.max(0, current - 1));
    }, 1000);
    const redirect = window.setTimeout(() => navigate('/bot-settings', { replace: true }), 5000);
    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(redirect);
    };
  }, [navigate, status]);

  const title = status === 'connected'
    ? 'Google Calendar connected'
    : status === 'cancelled'
      ? 'Google authorization was cancelled'
      : status === 'error'
        ? 'Could not connect Google Calendar'
        : user
          ? 'Finishing Google authorization…'
          : 'Google Calendar connection';
  const subtitle = status === 'connected'
    ? 'Connection complete. Choose a calendar in Bot Settings.'
    : status === 'pending' && user
      ? 'Google is checking your permission and saving the connection.'
      : !user
        ? 'Sign in with the same admin owner account that started this connection.'
        : '';

  return (
    <AdminAppearance>
      <Box
        sx={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          p: { xs: 2, sm: 3 },
          background: 'radial-gradient(ellipse at 20% 15%, var(--admin-login-teal), transparent 48%), radial-gradient(ellipse at 85% 85%, var(--admin-login-violet), transparent 50%), var(--admin-canvas)',
        }}
      >
        <Container maxWidth="sm" disableGutters>
          <Stack spacing={2.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Stack direction="row" spacing={1.25} alignItems="center">
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 2.5,
                    color: 'primary.main',
                    bgcolor: 'var(--admin-active-wash)',
                    border: '1px solid var(--admin-active-border)',
                  }}
                >
                  <CalendarMonthRounded />
                </Box>
                <Box>
                  <Typography variant="subtitle2" fontWeight={700}>{t('Massage / AI')}</Typography>
                  <Typography variant="caption" color="text.secondary">{t('Calendar connection')}</Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1}>
                <LanguageToggle />
                <ThemeToggle />
              </Stack>
            </Stack>

            <Paper
              variant="outlined"
              sx={{
                position: 'relative',
                overflow: 'hidden',
                width: '100%',
                p: { xs: 3, sm: 5 },
                borderColor: 'var(--admin-hero-border)',
                background: 'linear-gradient(145deg, var(--admin-panel-start), var(--admin-panel-end))',
                boxShadow: '0 24px 80px #0002',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  inset: '0 0 auto',
                  height: 3,
                  background: 'linear-gradient(90deg, var(--admin-accent), var(--admin-violet))',
                },
              }}
            >
              <Stack spacing={2.5} alignItems="center" textAlign="center">
                <Box
                  sx={{
                    width: 76,
                    height: 76,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: '50%',
                    color: status === 'connected' ? 'success.main' : status === 'error' ? 'error.main' : 'primary.main',
                    bgcolor: 'var(--admin-active-wash)',
                    position: 'relative',
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      inset: 7,
                      border: '1px solid currentColor',
                      borderRadius: '50%',
                      opacity: 0.3,
                    },
                  }}
                >
                  <Box sx={{ position: 'absolute', display: 'grid', placeItems: 'center', color: 'text.primary' }}>
                    {status === 'connected' ? <CheckCircleRounded sx={{ fontSize: 38, color: 'success.main' }} />
                      : status === 'cancelled' ? <InfoOutlined sx={{ fontSize: 38, color: 'warning.main' }} />
                        : status === 'error' ? <ErrorOutlineRounded sx={{ fontSize: 38, color: 'error.main' }} />
                          : !user ? <AccountCircleOutlined sx={{ fontSize: 38, color: 'primary.main' }} />
                            : <CircularProgress size={36} thickness={3} aria-label={t('Finishing Google authorization…')} />}
                  </Box>
                </Box>

                <Box>
                  <Typography component="h1" variant="h4" sx={{ fontSize: { xs: '1.7rem', sm: '2rem' } }}>
                    {t(title)}
                  </Typography>
                  {subtitle && <Typography color="text.secondary" sx={{ mt: 1 }}>{t(subtitle)}</Typography>}
                </Box>

                {status === 'pending' && user && <LinearProgress aria-label={t('Finishing Google authorization…')} sx={{ width: '100%', borderRadius: 8 }} />}

                {!user && (
                  <>
                    {status === 'error' && <Alert severity="error" sx={{ width: '100%', textAlign: 'left' }}>{t(message)}</Alert>}
                    <Button
                      fullWidth
                      variant="contained"
                      startIcon={<AccountCircleOutlined />}
                      onClick={() => void signIn().catch(() => {
                        setMessage('Sign-in failed. Please try again.');
                        setStatus('error');
                      })}
                    >
                      {t('Sign in as owner')}
                    </Button>
                  </>
                )}

                {status === 'connected' && (
                  <Stack spacing={1.25} sx={{ width: '100%' }}>
                    <Typography aria-live="polite" variant="body2" color="text.secondary">
                      {t('Returning to Bot Settings in {seconds} seconds.', { seconds: secondsRemaining ?? 5 })}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={((5 - (secondsRemaining ?? 5)) / 5) * 100}
                      sx={{ width: '100%', borderRadius: 8, height: 6 }}
                    />
                  </Stack>
                )}

                {(status === 'error' || status === 'cancelled') && user && (
                  <Alert severity={status === 'error' ? 'error' : 'info'} sx={{ width: '100%', textAlign: 'left' }}>
                    {t(message)}
                  </Alert>
                )}

                <Button
                  component={Link}
                  to="/bot-settings"
                  fullWidth
                  variant={status === 'connected' ? 'contained' : 'outlined'}
                  sx={{ minHeight: 46, mt: 0.5 }}
                >
                  {t('Return to Bot Settings')}
                </Button>
              </Stack>
            </Paper>

            <Typography variant="caption" color="text.secondary" textAlign="center">
              {t('Your calendar connection is protected by your admin account.')}
            </Typography>
          </Stack>
        </Container>
      </Box>
    </AdminAppearance>
  );
}
