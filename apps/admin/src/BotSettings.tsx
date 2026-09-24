import { Alert, Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import { botSettingsSchema, type BotSettings as BotSettingsDto } from '@booking/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { adminApi } from './api.js';

const queryKey = ['bot-settings'];
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';
type Draft = { maxReadDelayMs: string; typingDelayPerSymbolMs: string };
const toDraft = (settings: BotSettingsDto): Draft => ({ maxReadDelayMs: String(settings.maxReadDelayMs), typingDelayPerSymbolMs: String(settings.typingDelayPerSymbolMs) });

export const BotSettings = () => {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey, queryFn: adminApi.botSettings });
  const [draft, setDraft] = useState<Draft>({ maxReadDelayMs: '', typingDelayPerSymbolMs: '' });
  const [message, setMessage] = useState('');
  useEffect(() => { if (query.data) setDraft(toDraft(query.data)); }, [query.data]);

  const parsed = botSettingsSchema.safeParse({
    maxReadDelayMs: draft.maxReadDelayMs.trim() === '' ? Number.NaN : Number(draft.maxReadDelayMs),
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

  if (query.isPending) return <Typography>Loading bot settings…</Typography>;
  if (query.isError) return <Alert severity="error">Could not load bot settings. {errorText(query.error)}</Alert>;

  const dirty = draft.maxReadDelayMs !== String(query.data.maxReadDelayMs) || draft.typingDelayPerSymbolMs !== String(query.data.typingDelayPerSymbolMs);
  const canSave = dirty && parsed.success && !save.isPending;
  const saveDraft = () => { if (parsed.success) { setMessage(''); save.mutate(parsed.data); } };

  return <Stack spacing={2}>
    <Stack direction="row" alignItems="center" spacing={1}>
      <Chip size="small" color={query.data.isCustom ? 'primary' : 'default'} label={query.data.isCustom ? 'Custom settings' : 'Default settings'} />
      <Typography variant="body2" color="text.secondary">Changes apply to the next incoming message.</Typography>
    </Stack>
    <TextField
      label="Maximum read delay (ms)"
      type="number"
      value={draft.maxReadDelayMs}
      onChange={(event) => { setDraft((current) => ({ ...current, maxReadDelayMs: event.target.value })); setMessage(''); }}
      inputProps={{ min: 0, max: 10_000, step: 1, 'aria-label': 'Maximum read delay (ms)' }}
      helperText="Random delay before reading a Business message: 0–10,000 ms."
      error={draft.maxReadDelayMs !== '' && !botSettingsSchema.shape.maxReadDelayMs.safeParse(Number(draft.maxReadDelayMs)).success}
      disabled={save.isPending}
    />
    <TextField
      label="Typing delay per symbol (ms)"
      type="number"
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
  </Stack>;
};
