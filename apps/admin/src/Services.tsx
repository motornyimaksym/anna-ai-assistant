import { Alert, Box, Button, Card, CardActions, CardContent, CardMedia, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Paper, Stack, Switch, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { defaultServiceCaption, serviceDurationOptions, serviceSchema, telegramCaptionSchema, type ServiceDto, type TelegramMessageEntityDto, type TelegramUrlButtonDto } from '@booking/contracts';
import { adminApi } from './api.js';

type FormState = {
  id: string; name: string; description: string; options: { durationMinutes: string; price: string }[]; bufferMinutes: string; currency: string; enabled: boolean;
  photoUrl: string; captionText: string; entities: TelegramMessageEntityDto[]; buttons: TelegramUrlButtonDto[][];
};
type Selection = { start: number; end: number };
const queryKey = ['services'];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';
const newId = () => globalThis.crypto?.randomUUID?.() ?? `service-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const numberFromDraft = (value: string) => value.trim() === '' ? Number.NaN : Number(value);
const toForm = (service?: ServiceDto): FormState => ({
  id: service?.id ?? newId(), name: service?.name ?? '', description: service?.description ?? '', options: service ? serviceDurationOptions(service).map((option) => ({ durationMinutes: String(option.durationMinutes), price: String(option.price) })) : [{ durationMinutes: '60', price: '' }],
  bufferMinutes: String(service?.bufferMinutes ?? 30), currency: service?.currency ?? 'UAH', enabled: service?.enabled ?? true,
  photoUrl: service?.photoUrl ?? '', captionText: service?.telegramCaption?.text ?? '', entities: service?.telegramCaption?.entities ?? [], buttons: service?.telegramButtons?.map((row) => row.map((button) => ({ ...button }))) ?? [],
});
const toService = (form: FormState): unknown => ({
  id: form.id, name: form.name, description: form.description, durationMinutes: numberFromDraft(form.options[0]!.durationMinutes), bufferMinutes: numberFromDraft(form.bufferMinutes),
  price: numberFromDraft(form.options[0]!.price), durationOptions: form.options.slice(1).map((option) => ({ durationMinutes: numberFromDraft(option.durationMinutes), price: numberFromDraft(option.price) })), currency: form.currency.trim().toUpperCase(), enabled: form.enabled,
  ...(form.photoUrl ? { photoUrl: form.photoUrl } : {}),
  ...(form.captionText.trim() ? { telegramCaption: { text: form.captionText, entities: form.entities } } : {}),
  ...(form.buttons.length ? { telegramButtons: form.buttons } : {}),
});
const shiftEntities = (oldText: string, newText: string, entities: TelegramMessageEntityDto[]) => {
  let prefix = 0;
  while (prefix < oldText.length && prefix < newText.length && oldText[prefix] === newText[prefix]) prefix++;
  let oldSuffix = oldText.length; let newSuffix = newText.length;
  while (oldSuffix > prefix && newSuffix > prefix && oldText[oldSuffix - 1] === newText[newSuffix - 1]) { oldSuffix--; newSuffix--; }
  const delta = newSuffix - oldSuffix;
  return entities.flatMap((entity) => {
    const end = entity.offset + entity.length;
    if (end <= prefix) return [entity];
    if (entity.offset >= oldSuffix) return [{ ...entity, offset: entity.offset + delta }];
    if (entity.offset < prefix && end > oldSuffix) return [{ ...entity, length: entity.length + delta }];
    return [];
  });
};
const addPreviewStyles = (text: string, entities: TelegramMessageEntityDto[]): ReactNode => {
  if (!text) return <Typography color="text.secondary">Telegram caption preview appears here.</Typography>;
  const boundaries = [...new Set([0, text.length, ...entities.flatMap((entity) => [entity.offset, entity.offset + entity.length])])].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1]!;
    let node: ReactNode = text.slice(start, end);
    const active = entities.filter((entity) => entity.offset <= start && entity.offset + entity.length >= end).sort((a, b) => b.length - a.length);
    for (const entity of active) {
      if (entity.type === 'bold') node = <strong>{node}</strong>;
      else if (entity.type === 'italic') node = <em>{node}</em>;
      else if (entity.type === 'underline') node = <u>{node}</u>;
      else if (entity.type === 'strikethrough') node = <s>{node}</s>;
      else if (entity.type === 'spoiler') node = <Box component="span" sx={{ bgcolor: 'text.primary', color: 'text.primary', '&:hover': { color: 'background.paper' } }}>{node}</Box>;
      else if (entity.type === 'code' || entity.type === 'pre') node = <Box component="code" sx={{ bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 }}>{node}</Box>;
      else if (entity.type === 'blockquote' || entity.type === 'expandable_blockquote') node = <Box component="span" sx={{ borderLeft: 2, borderColor: 'divider', pl: 0.75, color: 'text.secondary' }}>{node}</Box>;
      else if (entity.type === 'text_link') node = <Box component="a" href={entity.url} target="_blank" rel="noreferrer">{node}</Box>;
    }
    return <Box component="span" key={`${start}-${end}`}>{node}</Box>;
  });
};

export const Services = () => {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey, queryFn: adminApi.services });
  const [form, setForm] = useState<FormState | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [linkUrl, setLinkUrl] = useState('');
  const captionInput = useRef<HTMLTextAreaElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const save = useMutation({
    mutationFn: async ({ service, creating, photo }: { service: ServiceDto; creating: boolean; photo: File | null }) => {
      const saved = await adminApi.saveService(service, creating);
      if (!photo) return saved;
      const upload = await adminApi.uploadServicePhoto(saved.id, photo);
      return { ...saved, photoUrl: upload.photoUrl };
    },
    onSuccess: (saved, variables) => {
      queryClient.setQueryData<ServiceDto[]>(queryKey, (current = []) => variables.creating ? [...current, saved] : current.map((item) => item.id === saved.id ? saved : item));
      setForm(null); setPhotoFile(null); setPhotoPreview(''); setFormError(''); setNotice(`${saved.name} saved.`); if (photoInput.current) photoInput.current.value = '';
    },
    onError: (error) => { setFormError(errorText(error)); void queryClient.invalidateQueries({ queryKey }); },
  });
  const toggle = useMutation({
    mutationFn: (service: ServiceDto) => adminApi.saveService({ ...service, enabled: !service.enabled }, false),
    onSuccess: (saved) => queryClient.setQueryData<ServiceDto[]>(queryKey, (current = []) => current.map((item) => item.id === saved.id ? saved : item)),
  });

  if (query.isPending) return <Typography>Loading services…</Typography>;
  if (query.isError) return <Alert severity="error">Could not load services. {errorText(query.error)}</Alert>;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => current ? { ...current, [key]: value } : current);
  const parsed = form ? serviceSchema.safeParse(toService(form)) : undefined;
  const canSave = Boolean(parsed?.success && !save.isPending && (!photoFile || photoFile.size <= MAX_PHOTO_BYTES));
  const open = (service?: ServiceDto) => { setIsNew(!service); setForm(toForm(service)); setPhotoFile(null); setPhotoPreview(service?.photoUrl ?? ''); setFormError(''); setSelection({ start: 0, end: 0 }); setLinkUrl(''); setNotice(''); if (photoInput.current) photoInput.current.value = ''; };
  const close = () => { if (!save.isPending) { setForm(null); setPhotoFile(null); setPhotoPreview(''); setFormError(''); if (photoInput.current) photoInput.current.value = ''; } };
  const addEntity = (type: TelegramMessageEntityDto['type']) => {
    if (!form || selection.end <= selection.start) { setFormError('Select caption text first.'); return; }
    const entity: TelegramMessageEntityDto = type === 'text_link' ? { type, offset: selection.start, length: selection.end - selection.start, url: linkUrl } : { type, offset: selection.start, length: selection.end - selection.start };
    const candidate = [...form.entities, entity].sort((a, b) => a.offset - b.offset || b.length - a.length);
    const valid = telegramCaptionSchema.safeParse({ text: form.captionText, entities: candidate });
    if (!valid.success) { setFormError(valid.error.issues[0]?.message ?? 'Invalid formatting selection.'); return; }
    setForm({ ...form, entities: valid.data.entities }); setFormError('');
  };
  const handlePhoto = (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setFormError('Use a JPEG, PNG, or WebP image.'); return; }
    if (file.size > MAX_PHOTO_BYTES) { setFormError('Image must be 5 MiB or smaller.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setPhotoPreview(typeof reader.result === 'string' ? reader.result : ''); setFormError(''); };
    reader.onerror = () => setFormError('Could not preview the selected image.');
    reader.readAsDataURL(file);
    setPhotoFile(file);
  };
  const addButton = () => {
    if (!form) return;
    const rows = form.buttons.map((row) => row.map((item) => ({ ...item })));
    if (rows.length && rows.at(-1)!.length < 2) rows[rows.length - 1]!.push({ text: '', url: '' });
    else rows.push([{ text: '', url: '' }]);
    update('buttons', rows);
  };
  const updateButton = (rowIndex: number, buttonIndex: number, key: keyof TelegramUrlButtonDto, value: string) => {
    if (!form) return;
    const rows = form.buttons.map((row) => row.map((item) => ({ ...item })));
    rows[rowIndex]![buttonIndex]![key] = value;
    update('buttons', rows);
  };
  const previewCaption = form ? (form.captionText || defaultServiceCaption({ name: form.name || 'Service name', description: form.description, durationMinutes: Number(form.options[0]!.durationMinutes), price: Number(form.options[0]!.price || '0'), durationOptions: form.options.slice(1).map((option) => ({ durationMinutes: Number(option.durationMinutes), price: Number(option.price) })), currency: form.currency }, Boolean(form.photoUrl || photoFile))) : '';

  return <Stack spacing={2}>
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography color="text.secondary">Service details drive booking. Telegram content controls the customer-facing card.</Typography>
      <Button variant="contained" onClick={() => open()} disabled={save.isPending}>Add service</Button>
    </Stack>
    {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
    {toggle.isError && <Alert severity="error">Could not change service status. {errorText(toggle.error)}</Alert>}
    {!query.data.length ? <Alert severity="info">No services yet. Add a service to let the assistant quote real prices and durations.</Alert> :
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 2 }}>
        {query.data.map((service) => <Card key={service.id} variant="outlined">
          {service.photoUrl && <CardMedia component="img" height="156" image={service.photoUrl} alt={service.name} />}
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="start" gap={1}><Typography variant="h6">{service.name}</Typography><Chip size="small" color={service.enabled ? 'success' : 'default'} label={service.enabled ? 'Active' : 'Disabled'} /></Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{service.description || 'No assistant description.'}</Typography>
            <Stack spacing={0.5} sx={{ mt: 1 }}>{serviceDurationOptions(service).map((option) => <Typography key={option.durationMinutes}>{option.durationMinutes} min · {option.price} {service.currency}</Typography>)}</Stack>
            <Typography variant="caption" color="text.secondary">Buffer {service.bufferMinutes} min</Typography>
          </CardContent>
          <CardActions>
            <Button size="small" onClick={() => open(service)} aria-label={`Edit ${service.name}`}>Edit</Button>
            <Button size="small" onClick={() => toggle.mutate(service)} disabled={toggle.isPending} aria-label={`${service.enabled ? 'Disable' : 'Enable'} ${service.name}`}>{service.enabled ? 'Disable' : 'Enable'}</Button>
          </CardActions>
        </Card>)}
      </Box>}

    <Dialog open={Boolean(form)} onClose={close} fullWidth maxWidth="xl" scroll="paper">
      <DialogTitle>{isNew ? 'Add service' : `Edit ${form?.name || 'service'}`}</DialogTitle>
      {form && <>
        <DialogContent dividers>
          <Stack spacing={3}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h6">Booking details</Typography>
                <TextField label="Service name" value={form.name} onChange={(event) => update('name', event.target.value)} required fullWidth />
                <TextField label="Description for assistant" value={form.description} onChange={(event) => update('description', event.target.value)} multiline minRows={3} inputProps={{ maxLength: 2000 }} helperText={`${form.description.length}/2,000. Used by assistant when explaining this service.`} fullWidth />
                <Typography variant="subtitle1">Duration and price options</Typography>
                <Typography variant="body2" color="text.secondary">Offer different session lengths under this service. Each duration needs its own price; currency and buffer apply to every option.</Typography>
                {form.options.map((option, index) => <Paper key={index} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField label={index === 0 ? 'Duration (minutes)' : `Option ${index + 1} duration (minutes)`} type="number" onWheel={(event) => { if (event.target instanceof HTMLInputElement) event.target.blur(); }} required value={option.durationMinutes} onChange={(event) => update('options', form.options.map((item, position) => position === index ? { ...item, durationMinutes: event.target.value } : item))} inputProps={{ min: 15, max: 480, step: 1 }} fullWidth />
                    <TextField label={index === 0 ? 'Price' : `Option ${index + 1} price`} type="number" onWheel={(event) => { if (event.target instanceof HTMLInputElement) event.target.blur(); }} required value={option.price} onChange={(event) => update('options', form.options.map((item, position) => position === index ? { ...item, price: event.target.value } : item))} inputProps={{ min: 0, step: 'any' }} fullWidth />
                    <IconButton aria-label={`Remove duration option ${index + 1}`} disabled={form.options.length === 1} onClick={() => update('options', form.options.filter((_, position) => position !== index))}>×</IconButton>
                  </Stack>
                </Paper>)}
                <Button variant="outlined" onClick={() => update('options', [...form.options, { durationMinutes: '', price: '' }])} disabled={form.options.length >= 10}>Add duration option</Button>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <TextField label="Buffer (minutes)" type="number" onWheel={(event) => { if (event.target instanceof HTMLInputElement) event.target.blur(); }} required value={form.bufferMinutes} onChange={(event) => update('bufferMinutes', event.target.value)} inputProps={{ min: 0, max: 120, step: 5 }} />
                  <TextField label="Currency" required value={form.currency} onChange={(event) => update('currency', event.target.value)} inputProps={{ maxLength: 3 }} />
                </Box>
                <FormControlLabel control={<Switch checked={form.enabled} onChange={(event) => update('enabled', event.target.checked)} />} label="Offer this service in Telegram" />
              </Stack>

              <Stack spacing={2}>
                <Typography variant="h6">Photo</Typography>
                {photoPreview ? <Box component="img" src={photoPreview} alt="Service photo preview" sx={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 1 }} /> : <Paper variant="outlined" sx={{ minHeight: 140, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>No photo attached</Paper>}
                <Stack direction="row" spacing={1} alignItems="center">
                  <Button component="label" variant="outlined">Attach photo<input ref={photoInput} aria-label="Service photo" hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handlePhoto(event.target.files?.[0])} /></Button>
                  {(form.photoUrl || photoFile) && <Button color="inherit" onClick={() => { setPhotoFile(null); setPhotoPreview(''); update('photoUrl', ''); if (photoInput.current) photoInput.current.value = ''; }}>Remove photo</Button>}
                  <Typography variant="caption" color="text.secondary">JPEG, PNG, WebP · max 5 MiB</Typography>
                </Stack>
              </Stack>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
              <Stack spacing={1.5}>
                <Typography variant="h6">Telegram caption</Typography>
                <Typography variant="body2" color="text.secondary">Select text, then format it. Telegram supports nested formatting and links. Leave blank for an automatic service summary.</Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5}>
                  {([['bold', 'Bold'], ['italic', 'Italic'], ['underline', 'Underline'], ['strikethrough', 'Strike'], ['spoiler', 'Spoiler'], ['code', 'Code'], ['blockquote', 'Quote'], ['expandable_blockquote', 'Expandable quote']] as const).map(([type, label]) => <Button key={type} size="small" variant="outlined" onClick={() => addEntity(type)}>{label}</Button>)}
                  <Button size="small" variant="outlined" onClick={() => addEntity('pre')}>Preformatted</Button>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <TextField label="Link URL" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} size="small" fullWidth placeholder="https://example.com" />
                  <Button onClick={() => addEntity('text_link')} disabled={!linkUrl}>Add link</Button>
                </Stack>
                <TextField label="Telegram caption" value={form.captionText} onChange={(event) => { update('entities', shiftEntities(form.captionText, event.target.value, form.entities)); update('captionText', event.target.value); }} inputRef={captionInput} onSelect={() => { if (captionInput.current) setSelection({ start: captionInput.current.selectionStart, end: captionInput.current.selectionEnd }); }} multiline minRows={5} inputProps={{ maxLength: 4096, 'aria-label': 'Telegram caption' }} helperText={`${form.captionText.length}/4,096 characters · photo caption max 1,024`} fullWidth />
                {form.entities.length > 0 && <Button size="small" color="inherit" onClick={() => update('entities', [])}>Clear formatting</Button>}
                <Typography variant="subtitle2">Inline URL buttons</Typography>
                {form.buttons.flatMap((row, rowIndex) => row.map((button, buttonIndex) => <Stack direction="row" spacing={1} key={`${rowIndex}-${buttonIndex}`}>
                  <TextField size="small" label={`Button ${rowIndex + 1}.${buttonIndex + 1} text`} required value={button.text} onChange={(event) => updateButton(rowIndex, buttonIndex, 'text', event.target.value)} inputProps={{ maxLength: 64 }} />
                  <TextField size="small" label={`Button ${rowIndex + 1}.${buttonIndex + 1} URL`} required value={button.url} onChange={(event) => updateButton(rowIndex, buttonIndex, 'url', event.target.value)} fullWidth />
                  <IconButton aria-label={`Remove button ${rowIndex + 1}.${buttonIndex + 1}`} onClick={() => update('buttons', form.buttons.map((items, index) => index === rowIndex ? items.filter((_, position) => position !== buttonIndex) : items).filter((items) => items.length))}>×</IconButton>
                </Stack>))}
                <Button size="small" onClick={addButton} disabled={form.buttons.reduce((sum, row) => sum + row.length, 0) >= 16}>Add URL button</Button>
              </Stack>

              <Stack spacing={1.5}>
                <Typography variant="h6">Telegram preview</Typography>
                <Paper variant="outlined" sx={{ p: 2, bgcolor: '#e6f3e7', borderRadius: 2, minHeight: 220 }}>
                  <Stack spacing={1.5}>
                    {(photoPreview || form.photoUrl) && <Box component="img" src={photoPreview || form.photoUrl} alt="Telegram service card" sx={{ width: '100%', maxHeight: 250, objectFit: 'cover', borderRadius: 1 }} />}
                    <Typography component="div" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{form.captionText ? addPreviewStyles(form.captionText, form.entities) : previewCaption}</Typography>
                    {form.buttons.length > 0 && <Stack spacing={0.5}>{form.buttons.flatMap((row, rowIndex) => <Stack direction="row" gap={0.5} key={rowIndex}>{row.map((button, index) => <Chip key={index} size="small" color="primary" label={button.text || 'Button'} />)}</Stack>)}</Stack>}
                  </Stack>
                </Paper>
                <Typography variant="caption" color="text.secondary">Cards are sent when the assistant looks up the service catalog.</Typography>
              </Stack>
            </Box>
            {formError && <Alert severity="error">{formError}</Alert>}
            {save.isError && <Alert severity="error">Could not save service. {errorText(save.error)}</Alert>}
            {parsed && !parsed.success && <Alert severity="warning">{parsed.error.issues[0]?.message ?? 'Check the service fields, caption formatting, and button links.'}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}><Button onClick={close} disabled={save.isPending}>Cancel</Button><Button variant="contained" onClick={() => { if (parsed?.success) save.mutate({ service: parsed.data, creating: isNew, photo: photoFile }); }} disabled={!canSave}>{save.isPending ? 'Saving…' : 'Save service'}</Button></DialogActions>
      </>}
    </Dialog>
  </Stack>;
};
