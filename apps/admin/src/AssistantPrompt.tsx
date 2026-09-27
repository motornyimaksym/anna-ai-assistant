import { Alert, Box, Button, Chip, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { AssistantPromptResponse } from '@booking/contracts';
import { adminApi } from './api.js';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';
const TabPanel = ({ active, id, children }: { active: boolean; id: string; children: React.ReactNode }) => <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab`} hidden={!active}><Box sx={{ pt: 3 }}>{children}</Box></div>;
const PromptEditor = ({ booking = false }: { booking?: boolean }) => {
  const queryClient = useQueryClient();
  const queryKey = [booking ? 'booking-prompt' : 'assistant-prompt'];
  const query = useQuery({ queryKey, queryFn: booking ? adminApi.bookingPrompt : adminApi.assistantPrompt });
  const [prompt, setPrompt] = useState('');
  const [message, setMessage] = useState('');
  const label = booking ? 'Booking prompt' : 'General prompt';
  const applies = booking ? 'Changes apply to the next Booking planner request.' : 'Changes apply to the next General response.';
  useEffect(() => { if (query.data) setPrompt(query.data.prompt); }, [query.data]);
  const saved = (value: AssistantPromptResponse, text: string) => { queryClient.setQueryData(queryKey, value); setPrompt(value.prompt); setMessage(text); };
  const save = useMutation({ mutationFn: () => (booking ? adminApi.saveBookingPrompt : adminApi.saveAssistantPrompt)(prompt), onSuccess: (value) => saved(value, `Saved. ${applies}`) });
  const reset = useMutation({ mutationFn: booking ? adminApi.resetBookingPrompt : adminApi.resetAssistantPrompt, onSuccess: (value) => saved(value, booking ? 'Reset to the default booking prompt.' : 'Reset to the repository default prompt.') });
  if (query.isPending) return <Typography>Loading {booking ? 'booking' : 'assistant'} prompt…</Typography>;
  if (query.isError) return <Alert severity="error">Could not load the {booking ? 'booking' : 'assistant'} prompt. {errorText(query.error)}</Alert>;
  const canSave = prompt !== query.data.prompt && prompt.trim().length > 0 && prompt.length <= 12_000 && !save.isPending && !reset.isPending;
  return <Stack spacing={2}>
    <Typography variant="h5">{booking ? 'System Two: Booking' : 'System Two: General'}</Typography>
    <Stack direction="row" alignItems="center" spacing={1}>
      <Chip size="small" color={query.data.isCustom ? 'primary' : 'default'} label={query.data.isCustom ? 'Custom prompt' : 'Default prompt'} />
      <Typography variant="body2" color="text.secondary">{applies}</Typography>
    </Stack>
    {booking && <Typography variant="body2">Edits structured planning within the Booking workflow. Uses recent schedule messages and Calendar availability to suggest times or prepare a booking for confirmation.</Typography>}
    <TextField label={label} value={prompt} onChange={(event) => { setPrompt(event.target.value); setMessage(''); }} multiline minRows={booking ? 12 : 18} fullWidth inputProps={{ maxLength: 12_000, 'aria-label': label }} helperText={`${prompt.length.toLocaleString()} / 12,000 characters`} disabled={save.isPending || reset.isPending} />
    {message && <Alert severity="success">{message}</Alert>}
    {save.isError && <Alert severity="error">Could not save the prompt. {errorText(save.error)}</Alert>}
    {reset.isError && <Alert severity="error">Could not reset the prompt. {errorText(reset.error)}</Alert>}
    <Box display="flex" gap={1}>
      <Button variant="contained" onClick={() => { setMessage(''); save.mutate(); }} disabled={!canSave}>{booking ? 'Save booking prompt' : 'Save'}</Button>
      <Button variant="outlined" color="inherit" onClick={() => { setMessage(''); reset.mutate(); }} disabled={!query.data.isCustom || save.isPending || reset.isPending}>{booking ? 'Reset booking prompt' : 'RESET'}</Button>
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
    <Typography variant="body2">System One automatically selects General or Booking for each message using conversation context. Code-owned instructions are read-only; General and Booking planner prompts can be edited.</Typography>
    <Tabs value={system} onChange={(_, value: 'one' | 'two') => setSystem(value)} aria-label="Prompt systems">
      <Tab value="one" label="System One" id="system-one-tab" aria-controls="system-one-panel" />
      <Tab value="two" label="System Two" id="system-two-tab" aria-controls="system-two-panel" />
    </Tabs>
    <TabPanel active={system === 'one'} id="system-one">
      {catalog.isPending ? <Typography>Loading prompt catalog…</Typography> : catalog.isError ? <Alert severity="error">Could not load prompt catalog. {errorText(catalog.error)}</Alert> : <>
        <Tabs value={onePrompt} onChange={(_, value: string) => setOnePrompt(value)} aria-label="System One prompts" variant="scrollable" scrollButtons="auto">
          {oneEntries.map(({ id, label }) => <Tab key={id} value={id} label={label} id={`one-${id}-tab`} aria-controls={`one-${id}-panel`} />)}
        </Tabs>
        {oneEntries.map(({ id, label, description, content }) => <TabPanel key={id} active={onePrompt === id} id={`one-${id}`}><Stack spacing={2}>
          <Typography variant="h5">{label}</Typography><Chip size="small" label="Code-owned · read-only" sx={{ alignSelf: 'flex-start' }} />
          <Typography variant="body2" color="text.secondary">{description}</Typography>
          <TextField label={`${label} instructions`} value={content} multiline minRows={8} fullWidth InputProps={{ readOnly: true }} />
        </Stack></TabPanel>)}
      </>}
    </TabPanel>
    <TabPanel active={system === 'two'} id="system-two">
      <Tabs value={twoPrompt} onChange={(_, value: string) => setTwoPrompt(value)} aria-label="System Two prompts" variant="scrollable" scrollButtons="auto">
        <Tab value="general" label="General" id="two-general-tab" aria-controls="two-general-panel" />
        <Tab value="booking-conversation" label="Booking conversation" id="two-booking-conversation-tab" aria-controls="two-booking-conversation-panel" />
        <Tab value="booking-planner" label="Booking planner" id="two-booking-planner-tab" aria-controls="two-booking-planner-panel" />
      </Tabs>
      <TabPanel active={twoPrompt === 'general'} id="two-general"><PromptEditor /></TabPanel>
      <TabPanel active={twoPrompt === 'booking-conversation'} id="two-booking-conversation">
        {catalog.isPending ? <Typography>Loading prompt catalog…</Typography> : catalog.isError ? <Alert severity="error">Could not load prompt catalog. {errorText(catalog.error)}</Alert> : twoEntries.map(({ id, description, content }) => <Stack key={id} spacing={2}>
          <Typography variant="h5">System Two: Booking conversation</Typography><Chip size="small" label="Code-owned · read-only" sx={{ alignSelf: 'flex-start' }} />
          <Typography variant="body2" color="text.secondary">{description}</Typography>
          <TextField label="Booking conversation instructions" value={content} multiline minRows={12} fullWidth InputProps={{ readOnly: true }} />
        </Stack>)}
      </TabPanel>
      <TabPanel active={twoPrompt === 'booking-planner'} id="two-booking-planner"><PromptEditor booking /></TabPanel>
    </TabPanel>
  </Stack>;
};
