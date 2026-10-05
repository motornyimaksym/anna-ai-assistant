import { Alert, Box, Button, Chip, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { AssistantPromptId } from '@booking/contracts';
import { adminApi } from './api.js';
import { useI18n } from "./i18n.js";

const errorText = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';
const TabPanel = ({ active, id, children }: { active: boolean; id: string; children: React.ReactNode }) => <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab`} hidden={!active}><Box sx={{ pt: 3 }}>{children}</Box></div>;
const CatalogPromptEditor = ({ id, label, description }: { id: AssistantPromptId; label: string; description: string }) => {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const queryKey = ['editable-prompt', id];
  const query = useQuery({ queryKey, queryFn: () => adminApi.prompt(id) });
  const [draft, setDraft] = useState<string | undefined>();
  const [message, setMessage] = useState('');
  const prompt = draft ?? query.data?.prompt ?? '';
  const save = useMutation({ mutationFn: () => adminApi.savePrompt(id, prompt), onSuccess: (value) => { queryClient.setQueryData(queryKey, value); setDraft(undefined); setMessage('Saved. Changes apply to the next request.'); } });
  const reset = useMutation({ mutationFn: () => adminApi.resetPrompt(id), onSuccess: (value) => { queryClient.setQueryData(queryKey, value); setDraft(undefined); setMessage('Reset to the default prompt.'); } });
  if (query.isPending) return <Typography>{t("Loading {label} prompt…", { label: t(label) })}</Typography>;
  if (query.isError) return <Alert severity="error">{t("Could not load {label} prompt.", { label: t(label) })}{t(" ")}{t(errorText(query.error))}</Alert>;
  const canSave = prompt !== query.data.prompt && prompt.trim().length > 0 && prompt.length <= 20_000 && !save.isPending && !reset.isPending;
  return <Stack spacing={2}>
    <Typography variant="h5">{t(label)}</Typography>
    <Stack direction="row" alignItems="center" spacing={1}>
      <Chip size="small" color={query.data.isCustom ? 'primary' : 'default'} label={query.data.isCustom ? t("Custom prompt") : t("Default prompt")} />
      <Typography variant="body2" color="text.secondary">{t(description)} {t(" ")}{t("Changes apply to the next request.")}</Typography>
    </Stack>
    <TextField label={t("{label} instructions", { label: t(label) })} value={prompt} onChange={(event) => { setDraft(event.target.value); setMessage(''); }} multiline minRows={12} fullWidth inputProps={{ maxLength: 20_000, 'aria-label': t("{label} instructions", { label: t(label) }) }} helperText={`${prompt.length.toLocaleString(language === "uk" ? "uk-UA" : "en-US")} / 20,000 ${t("characters")}`} disabled={save.isPending || reset.isPending} />
    {message && <Alert severity="success">{t(message)}</Alert>}
    {save.isError && <Alert severity="error">{t("Could not save the prompt.")}{t(" ")}{t(errorText(save.error))}</Alert>}
    {reset.isError && <Alert severity="error">{t("Could not reset the prompt.")}{t(" ")}{t(errorText(reset.error))}</Alert>}
    <Box display="flex" gap={1}>
      <Button variant="contained" onClick={() => { setMessage(''); save.mutate(); }} disabled={!canSave}>{t("Save")}{t(" ")}{t(label)} {t(" ")}{t("prompt")}</Button>
      <Button variant="outlined" color="inherit" onClick={() => { setMessage(''); reset.mutate(); }} disabled={!query.data.isCustom || save.isPending || reset.isPending}>{t("Reset")}{t(" ")}{t(label)} {t(" ")}{t("prompt")}</Button>
    </Box>
  </Stack>;
};
export const AssistantPrompt = () => {
  const { t } = useI18n();
  const [system, setSystem] = useState<'one' | 'two'>('one');
  const [onePrompt, setOnePrompt] = useState('handoff');
  const [twoPrompt, setTwoPrompt] = useState('assistant');
  const catalog = useQuery({ queryKey: ['prompt-catalog'], queryFn: adminApi.promptCatalog });
  const oneEntries = catalog.data?.systemOne ?? [];
  const twoEntries = catalog.data?.systemTwo ?? [];
  return <Stack spacing={2}>
    <Typography variant="body2">{t("System Two writes replies and can book a confirmed appointment in Calendar. System One checks whether the proposed reply sounds automated.")}</Typography>
    <Tabs value={system} onChange={(_, value: 'one' | 'two') => setSystem(value)} aria-label={t("Prompt systems")}>
      <Tab value="one" label={t("System One")} id="system-one-tab" aria-controls="system-one-panel" />
      <Tab value="two" label={t("System Two")} id="system-two-tab" aria-controls="system-two-panel" />
    </Tabs>
    <TabPanel active={system === 'one'} id="system-one">
      {catalog.isPending ? <Typography>{t("Loading prompt catalog…")}</Typography> : catalog.isError ? <Alert severity="error">{t("Could not load prompt catalog.")}{t(" ")}{t(errorText(catalog.error))}</Alert> : <>
        <Tabs value={onePrompt} onChange={(_, value: string) => setOnePrompt(value)} aria-label={t("System One prompts")} variant="scrollable" scrollButtons="auto">
          {oneEntries.map(({ id, label }) => <Tab key={id} value={id} label={t(label)} id={`one-${id}-tab`} aria-controls={`one-${id}-panel`} />)}
        </Tabs>
        {oneEntries.map(({ id, label, description }) => <TabPanel key={id} active={onePrompt === id} id={`one-${id}`}>{<CatalogPromptEditor id={id as AssistantPromptId} label={label} description={description} />}</TabPanel>)}
      </>}
    </TabPanel>
    <TabPanel active={system === 'two'} id="system-two">
      {catalog.isPending ? <Typography>{t("Loading prompt catalog…")}</Typography> : catalog.isError ? <Alert severity="error">{t("Could not load prompt catalog.")}{t(" ")}{t(errorText(catalog.error))}</Alert> : <>
        <Tabs value={twoPrompt} onChange={(_, value: string) => setTwoPrompt(value)} aria-label={t("System Two prompts")} variant="scrollable" scrollButtons="auto">
          {twoEntries.map(({ id, label }) => <Tab key={id} value={id} label={t(label)} id={`two-${id}-tab`} aria-controls={`two-${id}-panel`} />)}
        </Tabs>
        {twoEntries.map(({ id, label, description }) => <TabPanel key={id} active={twoPrompt === id} id={`two-${id}`}><CatalogPromptEditor id={id as AssistantPromptId} label={label} description={description} /></TabPanel>)}
      </>}
    </TabPanel>
  </Stack>;
};
