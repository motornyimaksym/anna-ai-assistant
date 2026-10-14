import { SystemOneSettings } from './SystemOneSettings.js';
import { GoogleCalendarSettings } from './GoogleCalendarSettings.js';
import { TelegramAccountSettings } from './TelegramAccountSettings.js';
import { HumanAssistanceSettings } from './HumanAssistanceSettings.js';
import { Alert, Box, Button, Card, CardContent, Chip, FormControlLabel, Stack, Switch, Tab, Tabs, TextField, Typography } from '@mui/material';
import { botSettingsSchema, updateAdminAccessSchema, type BotSettings as BotSettingsDto } from '@booking/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { adminApi } from './api.js';
import { useI18n } from "./i18n.js";

const queryKey = ['bot-settings'];
const adminAccessQueryKey = ['admin-access'];
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';
type Draft = { maxReadDelaySeconds: string; typingDelayPerSymbolMs: string };
type SettingsSection = 'assistant' | 'telegram' | 'connections' | 'team';
const millisecondsToSeconds = (milliseconds: number) => String(Number((milliseconds / 1000).toFixed(3)));
const toDraft = (settings: BotSettingsDto): Draft => ({ maxReadDelaySeconds: millisecondsToSeconds(settings.maxReadDelayMs), typingDelayPerSymbolMs: String(settings.typingDelayPerSymbolMs) });

function SettingsTabPanel({ section, active, children }: { section: SettingsSection; active: boolean; children: ReactNode }) {
  return <Box role="tabpanel" id={`bot-settings-panel-${section}`} aria-labelledby={`bot-settings-tab-${section}`} hidden={!active} sx={{ pt: 2.5 }}>
    {children}
  </Box>;
}

export const BotSettings = () => {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey, queryFn: adminApi.botSettings });
  const accessQuery = useQuery({ queryKey: adminAccessQueryKey, queryFn: adminApi.adminAccess });
  const [draft, setDraft] = useState<Draft>({ maxReadDelaySeconds: '', typingDelayPerSymbolMs: '' });
  const [activeSection, setActiveSection] = useState<SettingsSection>('assistant');
  const [testerUsernames, setTesterUsernames] = useState<string[]>([]);
  const [allUsersEnabled, setAllUsersEnabled] = useState(false);
  const [discloseAiIdentity, setDiscloseAiIdentity] = useState(true);
  const [newTester, setNewTester] = useState('');
  const [testerError, setTesterError] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [message, setMessage] = useState('');
  const [accessMessage, setAccessMessage] = useState('');
  const [accessError, setAccessError] = useState('');
  const canManage = accessQuery.data?.canManage ?? false;
  useEffect(() => { if (query.data) { setDraft(toDraft(query.data)); setTesterUsernames(query.data.testerUsernames); setAllUsersEnabled(query.data.allUsersEnabled); setDiscloseAiIdentity(query.data.discloseAiIdentity); } }, [query.data]);
  useEffect(() => { if (accessQuery.data) setEmails(accessQuery.data.emails); }, [accessQuery.data]);
  useEffect(() => { if (!canManage && activeSection === 'connections') setActiveSection('assistant'); }, [canManage, activeSection]);

  const readDelaySeconds = draft.maxReadDelaySeconds.trim() === '' ? Number.NaN : Number(draft.maxReadDelaySeconds);
  const readDelayMs = readDelaySeconds * 1000;
  const readDelayValid = Number.isInteger(readDelayMs) && botSettingsSchema.shape.maxReadDelayMs.safeParse(readDelayMs).success;
  const parsed = botSettingsSchema.safeParse({
    maxReadDelayMs: Number.isInteger(readDelayMs) ? readDelayMs : Number.NaN,
    typingDelayPerSymbolMs: draft.typingDelayPerSymbolMs.trim() === '' ? Number.NaN : Number(draft.typingDelayPerSymbolMs),
    testerUsernames,
    allUsersEnabled,
    discloseAiIdentity,
  });
  const save = useMutation({
    mutationFn: (settings: BotSettingsDto) => adminApi.saveBotSettings(settings),
    onSuccess: (value) => {
      queryClient.setQueryData(queryKey, value);
      setDraft(toDraft(value));
      setTesterUsernames(value.testerUsernames);
      setAllUsersEnabled(value.allUsersEnabled);
      setDiscloseAiIdentity(value.discloseAiIdentity);
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

  if (query.isPending) return <Typography>{t("Loading bot settings…")}</Typography>;
  if (query.isError) return <Alert severity="error">{t("Could not load bot settings.")}{t(" ")}{t(errorText(query.error))}</Alert>;

  const dirty = draft.maxReadDelaySeconds !== millisecondsToSeconds(query.data.maxReadDelayMs) || draft.typingDelayPerSymbolMs !== String(query.data.typingDelayPerSymbolMs) || JSON.stringify(testerUsernames) !== JSON.stringify(query.data.testerUsernames) || allUsersEnabled !== query.data.allUsersEnabled || discloseAiIdentity !== query.data.discloseAiIdentity;
  const canSave = dirty && parsed.success && !save.isPending;
  const saveDraft = () => { if (parsed.success) { setMessage(''); save.mutate(parsed.data); } };
  const addTester = () => {
    const result = botSettingsSchema.shape.testerUsernames.safeParse([...testerUsernames, newTester]);
    if (!result.success) { setTesterError(result.error.issues[0]?.message ?? 'Enter a valid Telegram username.'); return; }
    setTesterUsernames(result.data);
    setNewTester('');
    setTesterError('');
    setMessage('');
  };
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
  const tabProps = (section: SettingsSection) => ({ id: `bot-settings-tab-${section}`, 'aria-controls': `bot-settings-panel-${section}` });
  const sharedSettingsSection = activeSection === 'assistant' || activeSection === 'telegram';

  return <Stack spacing={2.5}>
    <Typography variant="body2" color="text.secondary">{t("Manage assistant behavior, Telegram access, connections, and team permissions.")}</Typography>
    <Tabs value={activeSection} onChange={(_event, value: SettingsSection) => setActiveSection(value)} aria-label={t("Bot settings sections")} variant="scrollable" scrollButtons="auto">
      <Tab value="assistant" label={t("Assistant")} {...tabProps('assistant')} />
      <Tab value="telegram" label={t("Telegram access")} {...tabProps('telegram')} />
      {canManage && <Tab value="connections" label={t("Connections")} {...tabProps('connections')} />}
      <Tab value="team" label={t("Team access")} {...tabProps('team')} />
    </Tabs>

    <SettingsTabPanel section="assistant" active={activeSection === 'assistant'}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6">{t("Assistant behavior")}</Typography>
          <Typography variant="body2" color="text.secondary">{t("Choose how the assistant responds and when it asks a person to help.")}</Typography>
        </Box>
        <Card variant="outlined"><CardContent><SystemOneSettings /></CardContent></Card>
        <Card variant="outlined"><CardContent><HumanAssistanceSettings /></CardContent></Card>
        <Card variant="outlined"><CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6">{t("Response timing and identity")}</Typography>
              <Typography variant="body2" color="text.secondary">{t("Set message timing and what the assistant says when asked whether it is AI.")}</Typography>
            </Box>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Chip size="small" color={query.data.isCustom ? 'primary' : 'default'} label={query.data.isCustom ? t("Custom settings") : t("Default settings")} />
              <Typography variant="body2" color="text.secondary">{t("Changes apply to the next incoming message.")}</Typography>
            </Stack>
            <TextField
              label={t("Maximum read delay (seconds)")}
              type="number"
              onWheel={(event) => { if (event.target instanceof HTMLInputElement) event.target.blur(); }}
              value={draft.maxReadDelaySeconds}
              onChange={(event) => { setDraft((current) => ({ ...current, maxReadDelaySeconds: event.target.value })); setMessage(''); }}
              inputProps={{ min: 0, max: 3540, step: 0.001, 'aria-label': 'Maximum read delay (seconds)' }}
              helperText={t("Random delay before reading a Business message: 0–3,540 seconds (up to 59 minutes).")}
              error={draft.maxReadDelaySeconds !== '' && !readDelayValid}
              disabled={save.isPending}
              sx={{ maxWidth: 560 }}
            />
            <TextField
              label={t("Typing delay per symbol (ms)")}
              type="number"
              onWheel={(event) => { if (event.target instanceof HTMLInputElement) event.target.blur(); }}
              value={draft.typingDelayPerSymbolMs}
              onChange={(event) => { setDraft((current) => ({ ...current, typingDelayPerSymbolMs: event.target.value })); setMessage(''); }}
              inputProps={{ min: 0, max: 800, step: 1, 'aria-label': 'Typing delay per symbol (ms)' }}
              helperText={t("Wait per Unicode symbol before sending an OpenAI answer: 0–800 ms.")}
              error={draft.typingDelayPerSymbolMs !== '' && !botSettingsSchema.shape.typingDelayPerSymbolMs.safeParse(Number(draft.typingDelayPerSymbolMs)).success}
              disabled={save.isPending}
              sx={{ maxWidth: 560 }}
            />
            <Box>
              <FormControlLabel
                control={<Switch checked={discloseAiIdentity} onChange={(_event, checked) => { setDiscloseAiIdentity(checked); setMessage(''); }} disabled={save.isPending} />}
                label={t("Disclose AI identity when asked directly")}
              />
              <Typography display="block" variant="body2" color="text.secondary">{t("When enabled, the assistant truthfully says it is AI. When disabled, it may pivot but never claim to be human.")}</Typography>
            </Box>
          </Stack>
        </CardContent></Card>
      </Stack>
    </SettingsTabPanel>

    <SettingsTabPanel section="telegram" active={activeSection === 'telegram'}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6">{t("Telegram access")}</Typography>
          <Typography variant="body2" color="text.secondary">{t("Choose who can use the assistant in eligible Telegram conversations.")}</Typography>
        </Box>
        <Card variant="outlined"><CardContent>
          <FormControlLabel
            control={<Switch checked={allUsersEnabled} onChange={(_event, checked) => { setAllUsersEnabled(checked); setMessage(''); }} disabled={save.isPending} />}
            label={t("Reply to all users")}
          />
          <Typography display="block" variant="body2" color="text.secondary">{t("When enabled, the assistant replies to eligible messages from everyone. When disabled, only testers below can use it.")}</Typography>
        </CardContent></Card>
        <Card variant="outlined"><CardContent>
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="h6">{t("Telegram testers")}</Typography>
              <Typography variant="body2" color="text.secondary">{t("This list applies when all-users mode is disabled. Add up to 20 usernames.")}</Typography>
            </Box>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {testerUsernames.map((username) => <Chip key={username} label={username} onDelete={!save.isPending ? () => { setTesterUsernames((current) => current.filter((item) => item !== username)); setTesterError(''); setMessage(''); } : undefined} />)}
              {testerUsernames.length === 0 && <Typography variant="body2" color="text.secondary">{t("No testers configured.")}</Typography>}
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
              <TextField
                label={t("Tester username")}
                value={newTester}
                onChange={(event) => { setNewTester(event.target.value); setTesterError(''); }}
                disabled={save.isPending || testerUsernames.length >= 20}
                helperText={t("Enter username with or without @. Usernames are saved lowercase.")}
                size="small"
              />
              <Button variant="outlined" onClick={addTester} disabled={save.isPending || testerUsernames.length >= 20 || !newTester.trim()}>{t("Add tester")}</Button>
            </Stack>
            {testerError && <Alert severity="error">{t(testerError)}</Alert>}
          </Stack>
        </CardContent></Card>
      </Stack>
    </SettingsTabPanel>

    <SettingsTabPanel section="connections" active={activeSection === 'connections'}>
      {canManage && <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6">{t("Connections")}</Typography>
            <Typography variant="body2" color="text.secondary">{t("Connect the services used for scheduling and availability.")}</Typography>
          </Box>
          <Card variant="outlined"><CardContent><GoogleCalendarSettings /></CardContent></Card>
          <Card variant="outlined"><CardContent><TelegramAccountSettings /></CardContent></Card>
        </Stack>}
    </SettingsTabPanel>

    <SettingsTabPanel section="team" active={activeSection === 'team'}>
      <Card variant="outlined"><CardContent>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="h6">{t("Team access")}</Typography>
            <Typography variant="body2" color="text.secondary">{t("Grant admin panel access to stakeholders by email. They must sign in with a verified email address.")}</Typography>
          </Box>
          {accessQuery.isPending && <Typography>{t("Loading stakeholder access…")}</Typography>}
          {accessQuery.isError && <Alert severity="error">{t("Could not load stakeholder access.")}{t(" ")}{t(errorText(accessQuery.error))}</Alert>}
          {accessQuery.data && <>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {emails.map((email) => <Chip key={email} label={email} onDelete={accessQuery.data.canManage && !saveAccess.isPending ? () => { setEmails((current) => current.filter((item) => item !== email)); setAccessMessage(''); } : undefined} />)}
              {emails.length === 0 && <Typography variant="body2" color="text.secondary">{t("No stakeholder emails added yet.")}</Typography>}
            </Stack>
            {accessQuery.data.canManage ? <>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
                <TextField
                  label={t("Stakeholder email")}
                  type="email"
                  value={newEmail}
                  onChange={(event) => { setNewEmail(event.target.value); setAccessError(''); }}
                  disabled={saveAccess.isPending || emails.length >= 100}
                  helperText={t("Up to 100 verified email addresses.")}
                  size="small"
                />
                <Button variant="outlined" onClick={addEmail} disabled={saveAccess.isPending || !newEmail.trim()}>{t("Add email")}</Button>
              </Stack>
              {accessError && <Alert severity="error">{t(accessError)}</Alert>}
              {accessMessage && <Alert severity="success">{t(accessMessage)}</Alert>}
              {saveAccess.isError && <Alert severity="error">{t("Could not save stakeholder access.")}</Alert>}
              <Box><Button variant="contained" onClick={() => { if (accessParsed.success) { setAccessMessage(''); saveAccess.mutate(accessParsed.data.emails); } }} disabled={!accessDirty || !accessParsed.success || saveAccess.isPending}>{t("Save stakeholder access")}</Button></Box>
            </> : <Typography variant="body2" color="text.secondary">{t("Only the owner can change stakeholder access.")}</Typography>}
          </>}
        </Stack>
      </CardContent></Card>
    </SettingsTabPanel>

    {sharedSettingsSection && <Card variant="outlined"><CardContent>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Box>
          <Typography variant="subtitle1">{t("Bot settings")}</Typography>
          <Typography variant="body2" color="text.secondary">{t("Changes from Assistant and Telegram access tabs are saved together.")}</Typography>
        </Box>
        <Button variant="contained" onClick={saveDraft} disabled={!canSave}>{save.isPending ? t("Saving…") : t("Save bot settings")}</Button>
      </Stack>
      {message && <Alert severity="success" sx={{ mt: 2 }}>{t(message)}</Alert>}
      {save.isError && <Alert severity="error" sx={{ mt: 2 }}>{t("Could not save bot settings.")}{t(" ")}{t(errorText(save.error))}</Alert>}
    </CardContent></Card>}
  </Stack>;
};
