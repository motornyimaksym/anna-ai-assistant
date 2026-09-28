import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { serviceDurationOptions, serviceSchema, type ServiceDto } from '@booking/contracts';
import { adminApi } from './api.js';

type Draft = { original: ServiceDto; name: string; description: string; options: { durationMinutes: string; price: string }[] };
const asNumber = (value: string) => value.trim() ? Number(value) : Number.NaN;
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';

export function KnowledgeBaseServiceEditor({ serviceId, serviceName, onSaved }: { serviceId: string; serviceName: string; onSaved: (service: ServiceDto) => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const save = useMutation({ mutationFn: (service: ServiceDto) => adminApi.saveService(service, false), onSuccess: (service) => { onSaved(service); setDraft(null); setError(''); }, onError: (cause) => setError(errorText(cause)) });
  const open = async () => {
    setLoading(true); setError('');
    try {
      const service = (await adminApi.services()).find((item) => item.id === serviceId && item.enabled);
      if (!service) throw new Error('Service is no longer available. Reload the page.');
      setDraft({ original: service, name: service.name, description: service.description, options: serviceDurationOptions(service).map((option) => ({ durationMinutes: String(option.durationMinutes), price: String(option.price) })) });
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
    <Button size="small" aria-label={`Edit ${serviceName}`} disabled={loading || save.isPending} onClick={() => void open()}>{loading ? 'Loading…' : 'Edit'}</Button>
    {error && !draft && <Alert severity="error">Could not open service. {error}</Alert>}
    <Dialog open={Boolean(draft)} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Edit service</DialogTitle>
      {draft && <>
        <DialogContent><Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Service name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required fullWidth />
          <TextField label="Description for assistant" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} multiline minRows={3} inputProps={{ maxLength: 2_000 }} fullWidth />
          <Typography variant="subtitle1">Duration and price options ({draft.original.currency})</Typography>
          {draft.options.map((option, index) => <Paper key={index} variant="outlined" sx={{ p: 1.5 }}><Stack direction="row" spacing={1} alignItems="center">
            <TextField label={index === 0 ? 'Duration (minutes)' : `Option ${index + 1} duration (minutes)`} type="number" required value={option.durationMinutes} onChange={(event) => setDraft({ ...draft, options: draft.options.map((item, position) => position === index ? { ...item, durationMinutes: event.target.value } : item) })} inputProps={{ min: 15, max: 480, step: 1 }} fullWidth />
            <TextField label={index === 0 ? 'Price' : `Option ${index + 1} price`} type="number" required value={option.price} onChange={(event) => setDraft({ ...draft, options: draft.options.map((item, position) => position === index ? { ...item, price: event.target.value } : item) })} inputProps={{ min: 0, step: 'any' }} fullWidth />
            <Button aria-label={`Remove option ${index + 1}`} disabled={draft.options.length === 1} onClick={() => setDraft({ ...draft, options: draft.options.filter((_, position) => position !== index) })}>Remove</Button>
          </Stack></Paper>)}
          <Button variant="outlined" disabled={draft.options.length >= 10} onClick={() => setDraft({ ...draft, options: [...draft.options, { durationMinutes: '', price: '' }] })}>Add duration option</Button>
          {parsed && !parsed.success && <Alert severity="warning">{parsed.error.issues[0]?.message}</Alert>}
          {error && <Alert severity="error">Could not save service. {error}</Alert>}
        </Stack></DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={save.isPending}>Cancel</Button>
          <Button variant="contained" disabled={!parsed?.success || save.isPending} onClick={() => { if (parsed?.success) save.mutate(parsed.data); }}>Save service</Button>
        </DialogActions>
      </>}
    </Dialog>
  </>;
}
