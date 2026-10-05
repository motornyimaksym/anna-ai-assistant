import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Button, Stack, TextField, Typography } from '@mui/material';
import type { TelegramScheduleChats, TelegramScheduleTopics } from '@booking/contracts';
import { adminApi } from './api.js';
import { ScheduleSyncStatus } from './ScheduleSyncStatus.js';
import { useI18n } from "./i18n.js";
const wholeChat = { id: 0, title: 'Whole chat (all topics)' };
export function ScheduleSourceSettings() {
  const { t } = useI18n();
  const cache = useQueryClient();
  const [selected, setSelected] = useState<TelegramScheduleChats['chats'][number] | null>(null);
  const [topic, setTopic] = useState<TelegramScheduleTopics['topics'][number] | null>(null);
  const [search, setSearch] = useState('');
  const [topicQuery, setTopicQuery] = useState('');
  const topics = useQuery({ queryKey: ['telegram-schedule-source-topics', selected?.id, topicQuery], queryFn: () => adminApi.telegramScheduleTopics(selected!.id, topicQuery), enabled: !!selected?.isForum, retry: false, gcTime: 0 });
  const snapshot = useQuery({ queryKey: ['telegram-schedule-slots'], queryFn: adminApi.telegramScheduleSlots, refetchInterval: 15000 });
  const chats = useQuery({ queryKey: ['telegram-schedule-source-chats'], queryFn: adminApi.telegramScheduleChats, enabled: false, retry: false, gcTime: 0 });
  const save = useMutation({ mutationFn: (source: { chatId: string; topicId?: number }) => adminApi.selectScheduleSource(source.chatId, source.topicId), onSuccess: (data) => { cache.setQueryData(['telegram-schedule-slots'], data); setSelected(null); setTopic(null); setSearch(''); setTopicQuery(''); } });
  return <Stack spacing={1.5}>
    <Typography variant="h6">{t("Schedule source")}</Typography>
    <Typography variant="body2">{t("Choose a Telegram chat to import. For groups with topics, choose an inner chat or the whole group. Messages remain read-only; changing source clears the previous snapshot.")}</Typography>
    <Button disabled={chats.isFetching || save.isPending} onClick={() => void chats.refetch()}>{chats.isFetching ? t("Loading chats…") : t("Load Telegram chats")}</Button>
    {chats.isError && <Alert severity="error">{chats.error.message}</Alert>}
    {chats.data && <>
      {chats.data.truncated && <Alert severity="warning">{t("Showing the first 1,000 chats. If yours is missing, move it into your recent chats and reload.")}</Alert>}
      <Autocomplete options={chats.data.chats} value={selected} onChange={(_, value) => { setSelected(value); setTopic(null); setSearch(''); setTopicQuery(''); }} isOptionEqualToValue={(a, b) => a.id === b.id} getOptionLabel={(chat) => `${chat.title} · ${chat.isForum ? t('group with topics') : t(chat.kind)} · ${chat.id}`} disabled={save.isPending} renderInput={(params) => <TextField {...params} label={t("Schedule chat")} />} />
      {selected?.isForum && <>
        <Stack direction="row" spacing={1}>
          <TextField label={t("Find topic by name")} value={search} onChange={(event) => setSearch(event.target.value)} inputProps={{ maxLength: 128 }} disabled={save.isPending} />
          <Button disabled={topics.isFetching || save.isPending} onClick={() => { setTopic(null); if (topicQuery === search.trim()) void topics.refetch(); else setTopicQuery(search.trim()); }}>{t("Search topics")}</Button>
        </Stack>
        {topics.isFetching && <Typography>{t("Loading topics…")}</Typography>}
        {topics.isError && <Alert severity="error">{topics.error.message} {t(" ")}{t("Use Search topics to retry.")}</Alert>}
        {topics.data?.truncated && <Alert severity="warning">{t("More topics available. Search by name to find a missing topic.")}</Alert>}
        {topics.data && !topics.data.topics.length && <Alert severity="info">{t("No matching topics found.")}</Alert>}
        <Autocomplete options={[wholeChat, ...(topics.data?.topics ?? [])]} value={topic ?? wholeChat} onChange={(_, value) => setTopic(value?.id ? value : null)} isOptionEqualToValue={(a, b) => a.id === b.id} getOptionLabel={(value) => value.id ? `${value.title} · ${t('topic')} · ${value.id}` : t(value.title)} disabled={topics.isFetching || save.isPending} renderInput={(params) => <TextField {...params} label={t("Schedule topic")} />} />
      </>}
      <Button variant="contained" disabled={!selected || save.isPending || (!!selected.isForum && topics.isFetching)} onClick={() => { if (selected) save.mutate({ chatId: selected.id, ...(selected.isForum && topic ? { topicId: topic.id } : {}) }); }}>{t("Save schedule source")}</Button>
    </>}
    {save.isError && <Alert severity="error">{save.error.message}</Alert>}
    {save.isSuccess && <Alert severity="success">{t("Source saved. Use Refresh now to import it; transient failures retry automatically.")}</Alert>}
    {snapshot.isError && <Alert severity="error">{t("Could not load sync status.")}</Alert>}
    {snapshot.data && <ScheduleSyncStatus data={snapshot.data} enableManualRetries />}
  </Stack>;
}
