import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { KnowledgeBaseResponse, ServiceDto } from '@booking/contracts';
import { adminApi } from './api.js';
import { KnowledgeBaseServiceEditor } from './KnowledgeBaseServiceEditor.js';
import { useI18n } from "./i18n.js";

const queryKey = ['knowledge-base'];
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';
const priceOptions = (service: { durationMinutes: number; durationOptions?: { durationMinutes: number; price: number }[]; price: number; currency: string }) => [
  { durationMinutes: service.durationMinutes, price: service.price },
  ...(service.durationOptions ?? []),
];

export const KnowledgeBase = () => {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey, queryFn: adminApi.knowledgeBase });
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => { if (query.data) setContent(query.data.content); }, [query.data?.content]);
  const serviceSaved = (saved: ServiceDto, creating: boolean) => {
    const summary = {
      id: saved.id, name: saved.name, description: saved.description, durationMinutes: saved.durationMinutes,
      ...(saved.durationOptions ? { durationOptions: saved.durationOptions } : {}), price: saved.price, currency: saved.currency,
    };
    queryClient.setQueryData<KnowledgeBaseResponse>(queryKey, (current) => current ? { ...current, services: creating ? [...current.services, summary] : current.services.map((item) => item.id === saved.id ? summary : item) } : current);
    queryClient.setQueryData<ServiceDto[]>(['services'], (current = []) => creating ? [...current, saved] : current.map((item) => item.id === saved.id ? saved : item));
    setMessage('Service catalog item saved. Changes apply to the next assistant request.');
  };
  const removeService = useMutation({
    mutationFn: (service: { id: string; name: string }) => adminApi.deleteService(service.id),
    onSuccess: (_, service) => {
      queryClient.setQueryData<KnowledgeBaseResponse>(queryKey, (current) => current ? { ...current, services: current.services.filter((item) => item.id !== service.id) } : current);
      queryClient.setQueryData<ServiceDto[]>(['services'], (current) => current?.filter((item) => item.id !== service.id));
      setDeleteTarget(null);
      setMessage('Service deleted from the catalog.');
    },
  });

  const save = useMutation({
    mutationFn: () => adminApi.saveKnowledgeBase(content),
    onSuccess: (value) => {
      queryClient.setQueryData(queryKey, value);
      setContent(value.content);
      setMessage('Saved. Changes apply to the next assistant request.');
    },
  });
  const reset = useMutation({
    mutationFn: adminApi.resetKnowledgeBase,
    onSuccess: (value) => {
      queryClient.setQueryData(queryKey, value);
      setContent(value.content);
      setMessage('Reset to the default knowledge base.');
    },
  });

  if (query.isPending) return <Typography>{t("Loading knowledge base…")}</Typography>;
  if (query.isError) return <Alert severity="error">{t("Could not load the knowledge base.")}{t(" ")}{errorText(query.error)}</Alert>;

  const dirty = content !== query.data.content;
  const canSave = dirty && content.trim().length > 0 && content.length <= 12_000 && !save.isPending && !reset.isPending;

  return <Stack spacing={2}>
    <Stack direction="row" alignItems="center" spacing={1}>
      <Chip size="small" color={query.data.isCustom ? 'primary' : 'default'} label={query.data.isCustom ? t("Custom knowledge base") : t("Default knowledge base")} />
      <Typography variant="body2" color="text.secondary">{t("Changes apply to the next assistant request.")}</Typography>
    </Stack>
    <Typography color="text.secondary">{t("Add business facts and guidance here. Keep response rules in Assistant prompt. Current enabled services, descriptions, durations, and prices are appended automatically from the booking catalog; edit them below.")}</Typography>
    <TextField
      label={t("Additional business knowledge")}
      value={content}
      onChange={(event) => { setContent(event.target.value); setMessage(''); }}
      multiline
      minRows={18}
      fullWidth
      inputProps={{ maxLength: 12_000, 'aria-label': 'Additional business knowledge' }}
      helperText={`${content.length.toLocaleString(language === "uk" ? "uk-UA" : "en-US")} / 12,000 ${t("characters")}`}
      disabled={save.isPending || reset.isPending}
    />
    <>
      <Divider />
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">{t("Services automatically included")}</Typography>
          <KnowledgeBaseServiceEditor onSaved={serviceSaved} />
        </Stack>
        {query.data.services.length ? <Stack spacing={1.5}>
          {query.data.services.map((service) => <Box key={service.id}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography fontWeight={600}>{service.name}</Typography>
              <KnowledgeBaseServiceEditor service={service} onSaved={serviceSaved} />
              <Button size="small" color="error" aria-label={t("Delete {name}", { name: service.name })} disabled={removeService.isPending} onClick={() => { setMessage(''); setDeleteTarget({ id: service.id, name: service.name }); }}>{t("Delete")}</Button>
            </Stack>
            {service.description && <Typography variant="body2" color="text.secondary">{service.description}</Typography>}
            <Typography variant="body2">{priceOptions(service).map((option) => `${option.durationMinutes} ${t("min")} - ${option.price} ${service.currency}`).join(' · ')}</Typography>
          </Box>)}
        </Stack> : <Typography variant="body2" color="text.secondary">{t("No enabled services. Add a service to include it in assistant replies and future bookings.")}</Typography>}
      </Box>
    </>
    {message && <Alert severity="success">{t(message)}</Alert>}
    {removeService.isError && <Alert severity="error">{t("Could not delete service.")}{t(" ")}{t(errorText(removeService.error))}</Alert>}
    {save.isError && <Alert severity="error">{t("Could not save the knowledge base.")}{t(" ")}{t(errorText(save.error))}</Alert>}
    {reset.isError && <Alert severity="error">{t("Could not reset the knowledge base.")}{t(" ")}{t(errorText(reset.error))}</Alert>}
    <Box display="flex" gap={1}>
      <Button variant="contained" onClick={() => { setMessage(''); save.mutate(); }} disabled={!canSave}>{t("Save")}</Button>
      <Button variant="outlined" color="inherit" onClick={() => { setMessage(''); reset.mutate(); }} disabled={!query.data.isCustom || save.isPending || reset.isPending}>{t("RESET")}</Button>
    </Box>
    <Dialog open={Boolean(deleteTarget)} onClose={() => { if (!removeService.isPending) setDeleteTarget(null); }}>
      <DialogTitle>{t("Delete")}{t(" ")}{deleteTarget?.name}?</DialogTitle>
      <DialogContent>{t("This removes the service from assistant replies and future booking options. Existing appointments remain unchanged.")}</DialogContent>
      <DialogActions>
        <Button onClick={() => setDeleteTarget(null)} disabled={removeService.isPending}>{t("Keep service")}</Button>
        <Button color="error" variant="contained" onClick={() => { if (deleteTarget) removeService.mutate(deleteTarget); }} disabled={removeService.isPending}>{removeService.isPending ? t("Deleting…") : t("Delete service")}</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
};
