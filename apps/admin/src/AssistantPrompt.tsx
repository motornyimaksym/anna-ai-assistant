import { Alert, Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { adminApi } from './api.js';

const queryKey = ['assistant-prompt'];
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';

export const AssistantPrompt = () => {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey, queryFn: adminApi.assistantPrompt });
  const [prompt, setPrompt] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { if (query.data) setPrompt(query.data.prompt); }, [query.data]);

  const save = useMutation({
    mutationFn: () => adminApi.saveAssistantPrompt(prompt),
    onSuccess: (value) => {
      queryClient.setQueryData(queryKey, value);
      setPrompt(value.prompt);
      setMessage('Saved. Changes apply to the next assistant message.');
    },
  });
  const reset = useMutation({
    mutationFn: adminApi.resetAssistantPrompt,
    onSuccess: (value) => {
      queryClient.setQueryData(queryKey, value);
      setPrompt(value.prompt);
      setMessage('Reset to the repository default prompt.');
    },
  });

  if (query.isPending) return <Typography>Loading assistant prompt…</Typography>;
  if (query.isError) return <Alert severity="error">Could not load the assistant prompt. {errorText(query.error)}</Alert>;

  const dirty = prompt !== query.data.prompt;
  const canSave = dirty && prompt.trim().length > 0 && prompt.length <= 12_000 && !save.isPending && !reset.isPending;

  return <Stack spacing={2}>
    <Stack direction="row" alignItems="center" spacing={1}>
      <Chip size="small" color={query.data.isCustom ? 'primary' : 'default'} label={query.data.isCustom ? 'Custom prompt' : 'Default prompt'} />
      <Typography variant="body2" color="text.secondary">Changes apply to the next assistant message.</Typography>
    </Stack>
    <TextField
      label="Assistant system prompt"
      value={prompt}
      onChange={(event) => { setPrompt(event.target.value); setMessage(''); }}
      multiline
      minRows={18}
      fullWidth
      inputProps={{ maxLength: 12_000, 'aria-label': 'Assistant system prompt' }}
      helperText={`${prompt.length.toLocaleString()} / 12,000 characters`}
      disabled={save.isPending || reset.isPending}
    />
    {message && <Alert severity="success">{message}</Alert>}
    {save.isError && <Alert severity="error">Could not save the prompt. {errorText(save.error)}</Alert>}
    {reset.isError && <Alert severity="error">Could not reset the prompt. {errorText(reset.error)}</Alert>}
    <Box display="flex" gap={1}>
      <Button variant="contained" onClick={() => { setMessage(''); save.mutate(); }} disabled={!canSave}>Save</Button>
      <Button variant="outlined" color="inherit" onClick={() => { setMessage(''); reset.mutate(); }} disabled={!query.data.isCustom || save.isPending || reset.isPending}>RESET</Button>
    </Box>
  </Stack>;
};
