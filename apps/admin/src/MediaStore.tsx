import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardActions, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MEDIA_PHOTO_MAX_BYTES, MEDIA_VIDEO_MAX_BYTES, mediaMetadataSchema, type MediaDto } from '@booking/contracts';
import { adminApi } from './api.js';

const queryKey = ['media'];
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';
const Preview = ({ url, kind }: { url: string; kind: 'photo' | 'video' }) => kind === 'photo'
  ? <Box component="img" src={url} alt="Media preview" sx={{ width: '100%', height: 200, objectFit: 'contain', bgcolor: 'grey.100' }} />
  : <Box component="video" src={url} controls preload="metadata" sx={{ width: '100%', height: 200, bgcolor: 'grey.100' }} />;

function MediaEditor({ item, onClose }: { item?: MediaDto; onClose: () => void }) {
  const client = useQueryClient();
  const [description, setDescription] = useState(item?.description ?? '');
  const [hours, setHours] = useState(String((item?.debounceSeconds ?? 86400) / 3600));
  const [enabled, setEnabled] = useState(item?.enabled ?? true);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState(item?.url);
  const [fileError, setFileError] = useState('');
  useEffect(() => {
    if (!file) { setPreview(item?.url); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, item?.url]);
  const seconds = Math.round(Number(hours) * 3600);
  const metadata = mediaMetadataSchema.safeParse({ description, debounceSeconds: seconds, enabled });
  const valid = hours.trim() !== '' && Number.isFinite(Number(hours)) && Number(hours) >= 0 && Number(hours) <= 8760 && metadata.success && Boolean(item || file) && !fileError;
  const save = useMutation({
    mutationFn: async () => {
      if (!valid || !metadata.success) throw new Error('Check the description, repeat interval and file.');
      return adminApi.saveMedia(item?.id, metadata.data, file);
    },
    onSuccess: async () => { await client.invalidateQueries({ queryKey }); onClose(); },
  });
  const selectFile = (selected?: File) => {
    if (!selected) return;
    if (!['image/jpeg', 'image/png', 'video/mp4'].includes(selected.type)) { setFileError('Choose a JPEG, PNG or MP4 file.'); return; }
    const max = selected.type === 'video/mp4' ? MEDIA_VIDEO_MAX_BYTES : MEDIA_PHOTO_MAX_BYTES;
    if (!selected.size || selected.size > max) { setFileError(`Choose a nonempty file up to ${max / 1_000_000} MB.`); return; }
    setFileError(''); setFile(selected);
  };
  return <Dialog open fullWidth maxWidth="sm" onClose={() => { if (!save.isPending) onClose(); }}>
    <DialogTitle>{item ? 'Edit media' : 'Add media'}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Typography color="text.secondary">Describe when this file helps answer a client. The description guides the assistant and is not sent as a caption.</Typography>
      <TextField label="Suitable situation, question or topic" multiline minRows={3} value={description} disabled={save.isPending} onChange={(event) => setDescription(event.target.value)} inputProps={{ maxLength: 2000 }} helperText={`${description.length} / 2,000 characters`} />
      <TextField label="Repeat interval (hours)" type="number" value={hours} disabled={save.isPending} onChange={(event) => setHours(event.target.value)} onWheel={(event) => { if (event.target instanceof HTMLInputElement) event.target.blur(); }} inputProps={{ min: 0, max: 8760, step: 'any' }} error={hours.trim() === '' || !Number.isFinite(Number(hours)) || Number(hours) < 0 || Number(hours) > 8760} helperText="24 hours prevents repeating this media in the same chat for one day. 0 allows repeats." />
      <FormControlLabel control={<Switch checked={enabled} disabled={save.isPending} onChange={(_, checked) => setEnabled(checked)} />} label="Available to assistant" />
      <Button component="label" variant="outlined" disabled={save.isPending}>{item ? 'Replace file' : 'Choose file'}<input hidden aria-label="Media file" type="file" accept="image/jpeg,image/png,video/mp4" onChange={(event) => { selectFile(event.target.files?.[0]); event.target.value = ''; }} /></Button>
      <Typography variant="body2">JPEG/PNG up to 5 MB. MP4 up to 20 MB.</Typography>
      {(file || item) && <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{file?.name ?? item?.filename}</Typography>}
      {fileError && <Alert severity="error">{fileError}</Alert>}
      {preview && <Preview url={preview} kind={file ? file.type === 'video/mp4' ? 'video' : 'photo' : item?.kind ?? 'photo'} />}
      {save.isError && <Alert severity="error">Could not save media. {errorMessage(save.error)}</Alert>}
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose} disabled={save.isPending}>Cancel</Button><Button variant="contained" disabled={!valid || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</Button></DialogActions>
  </Dialog>;
}

export function MediaStore() {
  const client = useQueryClient();
  const query = useQuery({ queryKey, queryFn: adminApi.media });
  const [editor, setEditor] = useState<MediaDto | 'new'>();
  const [deleting, setDeleting] = useState<MediaDto>();
  const remove = useMutation({ mutationFn: adminApi.deleteMedia, onSuccess: async () => { await client.invalidateQueries({ queryKey }); setDeleting(undefined); } });
  return <Stack spacing={2} sx={{ pb: 4 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
      <Typography color="text.secondary">Photos and videos the assistant can share when relevant to a client.</Typography>
      <Button variant="contained" onClick={() => setEditor('new')}>Add media</Button>
    </Stack>
    {query.isPending && <CircularProgress aria-label="Loading media" />}
    {query.isError && <Alert severity="error" action={<Button onClick={() => void query.refetch()}>Retry</Button>}>Could not load media. {errorMessage(query.error)}</Alert>}
    {query.data?.length === 0 && <Alert severity="info">No media yet. Add a file and describe when to send it.</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 2 }}>
      {query.data?.map((item) => <Card key={item.id} variant="outlined">
        <Preview url={item.url} kind={item.kind} />
        <CardContent><Stack spacing={1}>
          <Typography fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{item.filename}</Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.description}</Typography>
          <Typography variant="body2" color="text.secondary">Repeat interval: {Number((item.debounceSeconds / 3600).toFixed(4))} h</Typography>
          <Stack direction="row" spacing={1}><Chip size="small" label={item.kind === 'photo' ? 'Photo' : 'Video'} /><Chip size="small" label={item.enabled ? 'Enabled' : 'Disabled'} color={item.enabled ? 'success' : 'default'} /></Stack>
        </Stack></CardContent>
        <CardActions><Button onClick={() => setEditor(item)}>Edit</Button><Button color="error" onClick={() => { remove.reset(); setDeleting(item); }}>Delete</Button></CardActions>
      </Card>)}
    </Box>
    {editor && <MediaEditor item={editor === 'new' ? undefined : editor} onClose={() => setEditor(undefined)} />}
    <Dialog open={Boolean(deleting)} onClose={() => { if (!remove.isPending) setDeleting(undefined); }}>
      <DialogTitle>Delete media?</DialogTitle><DialogContent><Typography>This removes the file from Media Store. Messages already sent to clients remain in their chats.</Typography>{remove.isError && <Alert severity="error">Could not delete media. {errorMessage(remove.error)}</Alert>}</DialogContent>
      <DialogActions><Button disabled={remove.isPending} onClick={() => setDeleting(undefined)}>Cancel</Button><Button color="error" disabled={remove.isPending} onClick={() => { if (deleting) remove.mutate(deleting.id); }}>{remove.isPending ? 'Deleting…' : 'Delete'}</Button></DialogActions>
    </Dialog>
  </Stack>;
}
