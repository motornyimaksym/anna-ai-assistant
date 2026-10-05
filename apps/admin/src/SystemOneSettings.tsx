import { useState } from 'react';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SystemOneSettings as Settings } from '@booking/contracts';
import { adminApi } from './api.js';
import { useI18n } from "./i18n.js";

const queryKey = ['system-one-settings'];
export function SystemOneSettings() {
  const { t } = useI18n();
  const cache = useQueryClient();
  const query = useQuery({ queryKey, queryFn: adminApi.systemOneSettings });
  const [draft, setDraft] = useState<Settings['provider']>();
  const [saved, setSaved] = useState(false);
  const save = useMutation({ mutationFn: adminApi.saveSystemOneSettings, onSuccess: (value) => { cache.setQueryData(queryKey, value); setDraft(undefined); setSaved(true); } });
  if (query.isPending) return <Typography>{t("Loading System One provider…")}</Typography>;
  if (query.isError) return <Alert severity="error" action={<Button onClick={() => void query.refetch()}>{t("Retry")}</Button>}>{t("Could not load System One provider.")}</Alert>;
  const provider = draft ?? query.data.provider;
  return <Stack spacing={2}>
    <Typography variant="h6">{t("System One")}</Typography>
    <Typography variant="body2" color="text.secondary">{t("Choose the provider for human handoff probability. OpenAI is the default.")}</Typography>
    <TextField select label={t("System One provider")} value={provider} disabled={save.isPending} slotProps={{ select: { native: true }, htmlInput: { 'aria-label': 'System One provider' } }} onChange={(event) => { setDraft(event.target.value as Settings['provider']); setSaved(false); save.reset(); }} sx={{ maxWidth: 440 }}>
      <option value="openai">{t("OpenAI")}</option><option value="typesafe">{t("TypeSafe AI")}</option>
    </TextField>
    <Typography variant="body2" color="text.secondary">{provider === 'typesafe' ? t("TypeSafe AI falls back to OpenAI on provider errors. A valid probability never triggers fallback.") : t("OpenAI assesses handoff directly using the configured OpenAI model.")}</Typography>
    <Typography variant="caption" color="text.secondary">{t("Changing providers does not restore discarded proposals or retry bookings.")}</Typography>
    {saved && <Alert severity="success">{t("Saved. The next System One decision will use this provider.")}</Alert>}
    {save.isError && <Alert severity="error">{t("Could not save provider. Please try again.")}</Alert>}
    <Box><Button variant="contained" disabled={provider === query.data.provider || save.isPending} onClick={() => save.mutate({ provider })}>{save.isPending ? t("Saving…") : t("Save provider")}</Button></Box>
  </Stack>;
}
