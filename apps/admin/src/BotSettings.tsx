import { GoogleCalendarSettings } from './GoogleCalendarSettings.js';
import { TelegramAccountSettings } from './TelegramAccountSettings.js';
import { HumanAssistanceSettings } from './HumanAssistanceSettings.js';
import { Alert, Box, Button, Chip, Divider, Stack, TextField, Typography } from '@mui/material';
import { botSettingsSchema, updateAdminAccessSchema, type BotSettings as BotSettingsDto } from '@booking/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { adminApi } from './api.js';

const queryKey = ['bot-settings'];
const adminAccessQueryKey = ['admin-access'];
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';
type Draft = { maxReadDelaySeconds: string; typingDelayPerSymbolMs: string };
const millisecondsToSeconds = (milliseconds: number) => String(Number((milliseconds / 1000).toFixed(3)));
const toDraft = (settings: BotSettingsDto): Draft => ({ maxReadDelaySeconds: millisecondsToSeconds(settings.maxReadDelayMs), typingDelayPerSymbolMs: String(settings.typingDelayPerSymbolMs) });

export const BotSettings = () => {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey, queryFn: adminApi.botSettings });
  const accessQuery = useQuery({ queryKey: adminAccessQueryKey, queryFn: adminApi.adminAccess });
  const [draft, setDraft] = useState<Draft>({ maxReadDelaySeconds: '', typingDelayPerSymbolMs: '' });
  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [message, setMessage] = useState('');
  const [accessMessage, setAccessMessage] = useState('');
  const [accessError, setAccessError] = useState('');
  useEffect(() => { if (query.data) setDraft(toDraft(query.data)); }, [query.data]);
  useEffect(() => { if (accessQuery.data) setEmails(accessQuery.data.emails); }, [accessQuery.data]);

  const readDelaySeconds = draft.maxReadDelaySeconds.trim() === '' ? Number.NaN : Number(draft.maxReadDelaySeconds);
  const readDelayMs = readDelaySeconds * 1000;
  const readDelayValid = Number.isInteger(readDelayMs) && botSettingsSchema.shape.maxReadDelayMs.safeParse(readDelayMs).success;
  const parsed = botSettingsSchema.safeParse({
    maxReadDelayMs: Number.isInteger(readDelayMs) ? readDelayMs : Number.NaN,
    typingDelayPerSymbolMs: draft.typingDelayPerSymbolMs.trim() === '' ? Number.NaN : Number(draft.typingDelayPerSymbolMs),
  });
  const save = useMutation({
    mutationFn: (settings: BotSettingsDto) => adminApi.saveBotSettings(settings),
    onSuccess: (value) => {
      queryClient.setQueryData(queryKey, value);
      setDraft(toDraft(value));
      setMessage('Saved. Changes apply to the next incoming message.');
    },
  });
  const saveAccess = useMutation({
    mutationFn: (allowedEmails: string[]) => adminApi.saveAdminAccess(allowedEmails),
    onSuccess: (value) => {
      queryClient.setQueryData(adminAccessQueryKey, value);
      setEmails(value.emails);
      setAccessMessage('Stakeholder access saved.');
      setAccessError('');
    },
  });

  if (query.isPending) return <Typography>Loading bot settings…</Typography>;
  if (query.isError) return <Alert severity="error">Could not load bot settings. {errorText(query.error)}</Alert>;

  const dirty = draft.maxReadDelaySeconds !== millisecondsToSeconds(query.data.maxReadDelayMs) || draft.typingDelayPerSymbolMs !== String(query.data.typingDelayPerSymbolMs);
  const canSave = dirty && parsed.success && !save.isPending;
  const saveDraft = () => { if (parsed.success) { setMessage(''); save.mutate(parsed.data); } };
  const accessParsed = updateAdminAccessSchema.safeParse({ emails });
  const currentEmails = accessQuery.data?.emails ?? [];
  const accessDirty = JSON.stringify(emails) !== JSON.stringify(currentEmails);
  const addEmail = () => {
    const result = updateAdminAccessSchema.safeParse({ emails: [...emails, newEmail] });
    if (!result.success) { setAccessError(result.error.issues[0]?.message ?? 'Enter a valid, unique email address.'); return; }
    setEmails(result.data.emails);
    setNewEmail('');
    setAccessMessage('');
    setAccessError('');
  };

  return <Stack spacing={2}>
    {accessQuery.data?.canManage && <><GoogleCalendarSettings /><Divider /><TelegramAccountSettings /><Divider /></>}
    <HumanAssistanceSettings />
    <Divider />
    <Stack direction="row" alignItems="center" spacing={1}>
      <Chip size="small" color={query.data.isCustom ? 'primary' : 'default'} label={query.data.isCustom ? 'Custom settings' : 'Default settings'} />
      <Typography variant="body2" color="text.secondary">Changes apply to the next incoming message.</Typography>
    </Stack>
    <TextField
      label="Maximum read delay (seconds)"
      type="number"
      onWheel={(event) => { if (event.target instanceof HTMLInputElement) event.target.blur(); }}
      value={draft.maxReadDelaySeconds}
      onChange={(event) => { setDraft((current) => ({ ...current, maxReadDelaySeconds: event.target.value })); setMessage(''); }}
      inputProps={{ min: 0, max: 3540, step: 0.001, 'aria-label': 'Maximum read delay (seconds)' }}
      helperText="Random delay before reading a Business message: 0–3,540 seconds (up to 59 minutes)."
      error={draft.maxReadDelaySeconds !== '' && !readDelayValid}
      disabled={save.isPending}
    />
    <TextField
      label="Typing delay per symbol (ms)"
      type="number"
      onWheel={(event) => { if (event.target instanceof HTMLInputElement) event.target.blur(); }}
      value={draft.typingDelayPerSymbolMs}
      onChange={(event) => { setDraft((current) => ({ ...current, typingDelayPerSymbolMs: event.target.value })); setMessage(''); }}
      inputProps={{ min: 0, max: 800, step: 1, 'aria-label': 'Typing delay per symbol (ms)' }}
      helperText="Wait per Unicode symbol before sending an OpenAI answer: 0–800 ms."
      error={draft.typingDelayPerSymbolMs !== '' && !botSettingsSchema.shape.typingDelayPerSymbolMs.safeParse(Number(draft.typingDelayPerSymbolMs)).success}
      disabled={save.isPending}
    />
    {message && <Alert severity="success">{message}</Alert>}
    {save.isError && <Alert severity="error">Could not save bot settings. {errorText(save.error)}</Alert>}
    <Box display="flex" gap={1}>
      <Button variant="contained" onClick={saveDraft} disabled={!canSave}>Save</Button>
    </Box>
    <Divider />
    <Stack spacing={1.5}>
      <Typography variant="h6">Admin access</Typography>
      <Typography variant="body2" color="text.secondary">Grant admin panel access to stakeholders by email. They must sign in with a verified email address.</Typography>
      {accessQuery.isPending && <Typography>Loading stakeholder access…</Typography>}
      {accessQuery.isError && <Alert severity="error">Could not load stakeholder access. {errorText(accessQuery.error)}</Alert>}
      {accessQuery.data && <>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {emails.map((email) => <Chip key={email} label={email} onDelete={accessQuery.data.canManage && !saveAccess.isPending ? () => { setEmails((current) => current.filter((item) => item !== email)); setAccessMessage(''); } : undefined} />)}
          {emails.length === 0 && <Typography variant="body2" color="text.secondary">No stakeholder emails added yet.</Typography>}
        </Stack>
        {accessQuery.data.canManage ? <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
            <TextField
              label="Stakeholder email"
              type="email"
              value={newEmail}
              onChange={(event) => { setNewEmail(event.target.value); setAccessError(''); }}
              disabled={saveAccess.isPending || emails.length >= 100}
              helperText="Up to 100 verified email addresses."
              size="small"
            />
            <Button variant="outlined" onClick={addEmail} disabled={saveAccess.isPending || !newEmail.trim()}>Add email</Button>
          </Stack>
          {accessError && <Alert severity="error">{accessError}</Alert>}
          {accessMessage && <Alert severity="success">{accessMessage}</Alert>}
          {saveAccess.isError && <Alert severity="error">Could not save stakeholder access. {errorText(saveAccess.error)}</Alert>}
          <Box display="flex" gap={1}>
            <Button variant="contained" onClick={() => { if (accessParsed.success) { setAccessMessage(''); saveAccess.mutate(accessParsed.data.emails); } }} disabled={!accessDirty || !accessParsed.success || saveAccess.isPending}>Save stakeholder access</Button>
          </Box>
        </> : <Typography variant="body2" color="text.secondary">Only the owner can change stakeholder access.</Typography>}
      </>}
    </Stack>
  </Stack>;
};
