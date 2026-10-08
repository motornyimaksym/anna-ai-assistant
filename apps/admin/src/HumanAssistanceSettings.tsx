import { Alert, Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import { updateHumanAssistanceSettingsSchema } from '@booking/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { adminApi } from './api.js';
import { useI18n } from "./i18n.js";

const key = ['human-assistance-settings'];
export function HumanAssistanceSettings() {
  const { t } = useI18n();
  const client = useQueryClient();
  const query = useQuery({ queryKey: key, queryFn: adminApi.humanAssistanceSettings });
  const [usernames, setUsernames] = useState<string[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (query.data) setUsernames(query.data.responders.map((item) => item.username)); }, [query.data]);
  const save = useMutation({ mutationFn: (settings: { usernames: string[] }) => adminApi.saveHumanAssistanceSettings(settings), onSuccess: (value) => { client.setQueryData(key, value); setSaved(true); setError(''); } });
  if (query.isPending) return <Typography>{t("Loading human assistance settings…")}</Typography>;
  if (query.isError) return <Alert severity="error">{t("Could not load human assistance settings.")}</Alert>;
  const parsed = updateHumanAssistanceSettingsSchema.safeParse({ usernames });
  const dirty = JSON.stringify(usernames) !== JSON.stringify(query.data.responders.map((item) => item.username));
  const add = () => {
    const result = updateHumanAssistanceSettingsSchema.safeParse({ usernames: [...usernames, newUsername] });
    if (!result.success) { setError(result.error.issues[0]?.message ?? 'Invalid username.'); return; }
    setUsernames(result.data.usernames);
    setNewUsername(''); setError(''); setSaved(false);
  };
  return <Stack spacing={2}>
    <Typography variant="h6">{t("Human assistance")}</Typography>
    <Typography variant="body2">{t("System One rewrites each draft using its prompt, four latest messages, and the draft. Explicit human requests and processing or delivery failures go to responders.")}</Typography>
    <Typography variant="subtitle1">{t("Telegram responders")}</Typography>
    <Typography variant="body2">{t("Each responder must send /start to this bot before private notifications can arrive.")}</Typography>
    {usernames.length === 0 && <Alert severity="warning">{t("No responders configured. Requests needing human help remain in Conversations.")}</Alert>}
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {usernames.map((username) => <Chip key={username} label={`@${username} · ${t(query.data.responders.find((item) => item.username === username)?.connected ? 'connected' : 'not connected')}`} onDelete={() => { setUsernames((items) => items.filter((item) => item !== username)); setSaved(false); }} />)}
    </Stack>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <TextField label={t("Telegram username")} value={newUsername} onChange={(event) => { setNewUsername(event.target.value); setError(''); }} size="small" helperText={t("Up to 20 usernames; @ optional.")} />
      <Button onClick={add} disabled={!newUsername.trim() || usernames.length >= 20}>{t("Add responder")}</Button>
    </Stack>
    {error && <Alert severity="error">{t(error)}</Alert>}
    {save.isError && <Alert severity="error">{t("Could not save human assistance settings.")}</Alert>}
    {saved && <Alert severity="success">{t("Human assistance settings saved.")}</Alert>}
    <Box><Button variant="contained" disabled={!dirty || !parsed.success || save.isPending} onClick={() => { if (parsed.success) save.mutate(parsed.data); }}>{t("Save human assistance")}</Button></Box>
  </Stack>;
}
