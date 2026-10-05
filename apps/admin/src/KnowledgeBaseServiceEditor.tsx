import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { serviceDurationOptions, serviceSchema, type ServiceDto } from '@booking/contracts';
import { adminApi } from './api.js';
import { useI18n } from "./i18n.js";

type Draft = { original: ServiceDto; name: string; description: string; options: { durationMinutes: string; price: string }[] };
const asNumber = (value: string) => value.trim() ? Number(value) : Number.NaN;
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';

const newService = (): ServiceDto => ({
  id: globalThis.crypto?.randomUUID?.() ?? `service-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: '', description: '', durationMinutes: 60, bufferMinutes: 30, price: 0, currency: 'UAH', enabled: true,
});

export function KnowledgeBaseServiceEditor({ service, onSaved }: { service?: Pick<ServiceDto, 'id' | 'name'>; onSaved: (saved: ServiceDto, creating: boolean) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const save = useMutation({ mutationFn: (value: ServiceDto) => adminApi.saveService(value, creating), onSuccess: (saved) => { onSaved(saved, creating); setDraft(null); setError(''); }, onError: (cause) => setError(errorText(cause)) });
  const open = async () => {
    setError('');
    if (!service) {
      const original = newService();
      setCreating(true);
      setDraft({ original, name: '', description: '', options: [{ durationMinutes: '60', price: '' }] });
      return;
    }
    setLoading(true); setError('');
    try {
      const latest = (await adminApi.services()).find((item) => item.id === service.id && item.enabled);
      if (!latest) throw new Error('Service is no longer available. Reload the page.');
      setCreating(false);
      setDraft({ original: latest, name: latest.name, description: latest.description, options: serviceDurationOptions(latest).map((option) => ({ durationMinutes: String(option.durationMinutes), price: String(option.price) })) });
    } catch (cause) { setError(errorText(cause)); }
    finally { setLoading(false); }
  };
  const candidate = draft ? {
    ...draft.original, name: draft.name, description: draft.description,
    durationMinutes: asNumber(draft.options[0]!.durationMinutes), price: asNumber(draft.options[0]!.price),
    durationOptions: draft.options.slice(1).map((option) => ({ durationMinutes: asNumber(option.durationMinutes), price: asNumber(option.price) })),
  } : null;
  const parsed = candidate ? serviceSchema.safeParse(candidate) : null;
  const close = () => { if (!save.isPending) { setDraft(null); setError(''); } };

  return <>
    <Button size={service ? 'small' : 'medium'} variant={service ? 'text' : 'outlined'} aria-label={service ? t("Edit {name}", { name: service.name }) : t("Add service")} disabled={loading || save.isPending} onClick={() => void open()}>{loading ? t("Loading…") : service ? t("Edit") : t("Add")}</Button>
    {error && !draft && <Alert severity="error">{t("Could not open service.")}{t(" ")}{t(error)}</Alert>}
    <Dialog open={Boolean(draft)} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>{creating ? t("Add service") : t("Edit service")}</DialogTitle>
      {draft && <>
        <DialogContent><Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label={t("Service name")} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required fullWidth />
          <TextField label={t("Description for assistant")} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} multiline minRows={3} inputProps={{ maxLength: 2_000 }} fullWidth />
          <Typography variant="subtitle1">{t("Duration and price options (")}{draft.original.currency})</Typography>
          {draft.options.map((option, index) => <Paper key={index} variant="outlined" sx={{ p: 1.5 }}><Stack direction="row" spacing={1} alignItems="center">
            <TextField label={index === 0 ? t("Duration (minutes)") : t("Option {number} duration (minutes)", { number: index + 1 })} type="number" required value={option.durationMinutes} onChange={(event) => setDraft({ ...draft, options: draft.options.map((item, position) => position === index ? { ...item, durationMinutes: event.target.value } : item) })} inputProps={{ min: 15, max: 480, step: 1 }} fullWidth />
            <TextField label={index === 0 ? t("Price") : t("Option {number} price", { number: index + 1 })} type="number" required value={option.price} onChange={(event) => setDraft({ ...draft, options: draft.options.map((item, position) => position === index ? { ...item, price: event.target.value } : item) })} inputProps={{ min: 0, step: 'any' }} fullWidth />
            <Button aria-label={t("Remove option {number}", { number: index + 1 })} disabled={draft.options.length === 1} onClick={() => setDraft({ ...draft, options: draft.options.filter((_, position) => position !== index) })}>{t("Remove")}</Button>
          </Stack></Paper>)}
          <Button variant="outlined" disabled={draft.options.length >= 10} onClick={() => setDraft({ ...draft, options: [...draft.options, { durationMinutes: '', price: '' }] })}>{t("Add duration option")}</Button>
          {parsed && !parsed.success && <Alert severity="warning">{t(parsed.error.issues[0]?.message ?? "Invalid service details.")}</Alert>}
          {error && <Alert severity="error">{t("Could not save service.")}{t(" ")}{t(error)}</Alert>}
        </Stack></DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={save.isPending}>{t("Cancel")}</Button>
          <Button variant="contained" disabled={!parsed?.success || save.isPending} onClick={() => { if (parsed?.success) save.mutate(parsed.data); }}>{t("Save service")}</Button>
        </DialogActions>
      </>}
    </Dialog>
  </>;
}
