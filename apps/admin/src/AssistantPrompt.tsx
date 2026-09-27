import { Alert, Box, Button, Chip, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { AssistantPromptId } from '@booking/contracts';
import { adminApi } from './api.js';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';
const TabPanel = ({ active, id, children }: { active: boolean; id: string; children: React.ReactNode }) => <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab`} hidden={!active}><Box sx={{ pt: 3 }}>{children}</Box></div>;
const CatalogPromptEditor = ({ id, label, description }: { id: AssistantPromptId; label: string; description: string }) => {
  const queryClient = useQueryClient();
  const queryKey = ['editable-prompt', id];
  const query = useQuery({ queryKey, queryFn: () => adminApi.prompt(id) });
  const [draft, setDraft] = useState<string | undefined>();
  const [message, setMessage] = useState('');
  const prompt = draft ?? query.data?.prompt ?? '';
  const save = useMutation({ mutationFn: () => adminApi.savePrompt(id, prompt), onSuccess: (value) => { queryClient.setQueryData(queryKey, value); setDraft(undefined); setMessage('Saved. Changes apply to the next request.'); } });
  const reset = useMutation({ mutationFn: () => adminApi.resetPrompt(id), onSuccess: (value) => { queryClient.setQueryData(queryKey, value); setDraft(undefined); setMessage('Reset to the default prompt.'); } });
  if (query.isPending) return <Typography>Loading {label} prompt…</Typography>;
  if (query.isError) return <Alert severity="error">Could not load the {label} prompt. {errorText(query.error)}</Alert>;
  const canSave = prompt !== query.data.prompt && prompt.trim().length > 0 && prompt.length <= 12_000 && !save.isPending && !reset.isPending;
  return <Stack spacing={2}>
    <Typography variant="h5">{label}</Typography>
    <Stack direction="row" alignItems="center" spacing={1}>
      <Chip size="small" color={query.data.isCustom ? 'primary' : 'default'} label={query.data.isCustom ? 'Custom prompt' : 'Default prompt'} />
      <Typography variant="body2" color="text.secondary">{description} Changes apply to the next request.</Typography>
    </Stack>
    <TextField label={`${label} instructions`} value={prompt} onChange={(event) => { setDraft(event.target.value); setMessage(''); }} multiline minRows={12} fullWidth inputProps={{ maxLength: 12_000, 'aria-label': `${label} instructions` }} helperText={`${prompt.length.toLocaleString()} / 12,000 characters`} disabled={save.isPending || reset.isPending} />
    {message && <Alert severity="success">{message}</Alert>}
    {save.isError && <Alert severity="error">Could not save the prompt. {errorText(save.error)}</Alert>}
    {reset.isError && <Alert severity="error">Could not reset the prompt. {errorText(reset.error)}</Alert>}
    <Box display="flex" gap={1}>
      <Button variant="contained" onClick={() => { setMessage(''); save.mutate(); }} disabled={!canSave}>Save {label} prompt</Button>
      <Button variant="outlined" color="inherit" onClick={() => { setMessage(''); reset.mutate(); }} disabled={!query.data.isCustom || save.isPending || reset.isPending}>Reset {label} prompt</Button>
    </Box>
  </Stack>;
};
export const AssistantPrompt = () => {
  const [system, setSystem] = useState<'one' | 'two'>('one');
  const [onePrompt, setOnePrompt] = useState('routing');
  const [twoPrompt, setTwoPrompt] = useState('general');
  const catalog = useQuery({ queryKey: ['prompt-catalog'], queryFn: adminApi.promptCatalog });
  const oneEntries = catalog.data?.systemOne ?? [];
  const twoEntries = catalog.data?.systemTwo ?? [];
  return <Stack spacing={2}>
    <Typography variant="body2">System One automatically selects General or Booking for each message using conversation context. Every prompt can be edited; provider schemas, tool access, and booking checks remain enforced by the server.</Typography>
    <Tabs value={system} onChange={(_, value: 'one' | 'two') => setSystem(value)} aria-label="Prompt systems">
      <Tab value="one" label="System One" id="system-one-tab" aria-controls="system-one-panel" />
      <Tab value="two" label="System Two" id="system-two-tab" aria-controls="system-two-panel" />
    </Tabs>
    <TabPanel active={system === 'one'} id="system-one">
      {catalog.isPending ? <Typography>Loading prompt catalog…</Typography> : catalog.isError ? <Alert severity="error">Could not load prompt catalog. {errorText(catalog.error)}</Alert> : <>
        <Tabs value={onePrompt} onChange={(_, value: string) => setOnePrompt(value)} aria-label="System One prompts" variant="scrollable" scrollButtons="auto">
          {oneEntries.map(({ id, label }) => <Tab key={id} value={id} label={label} id={`one-${id}-tab`} aria-controls={`one-${id}-panel`} />)}
        </Tabs>
        {oneEntries.map(({ id, label, description }) => <TabPanel key={id} active={onePrompt === id} id={`one-${id}`}><CatalogPromptEditor id={id as AssistantPromptId} label={label} description={description} /></TabPanel>)}
      </>}
    </TabPanel>
    <TabPanel active={system === 'two'} id="system-two">
      {catalog.isPending ? <Typography>Loading prompt catalog…</Typography> : catalog.isError ? <Alert severity="error">Could not load prompt catalog. {errorText(catalog.error)}</Alert> : <>
        <Tabs value={twoPrompt} onChange={(_, value: string) => setTwoPrompt(value)} aria-label="System Two prompts" variant="scrollable" scrollButtons="auto">
          {twoEntries.map(({ id, label }) => <Tab key={id} value={id} label={label} id={`two-${id}-tab`} aria-controls={`two-${id}-panel`} />)}
        </Tabs>
        {twoEntries.map(({ id, label, description }) => <TabPanel key={id} active={twoPrompt === id} id={`two-${id}`}><CatalogPromptEditor id={id as AssistantPromptId} label={label} description={description} /></TabPanel>)}
      </>}
    </TabPanel>
  </Stack>;
};
