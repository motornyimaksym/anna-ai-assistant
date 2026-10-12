import { useState } from 'react';
import { Alert, Box, Button, Card, CardActions, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { messageStoreMetadataSchema, type MessageStoreDto } from '@booking/contracts';
import { adminApi } from './api.js';
import { useI18n } from './i18n.js';

const queryKey = ['message-store'];
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';

function MessageEditor({ item, onClose }: { item?: MessageStoreDto; onClose: () => void }) {
  const { t, language } = useI18n();
  const client = useQueryClient();
  const [description, setDescription] = useState(item?.description ?? '');
  const [text, setText] = useState(item?.text ?? '');
  const [enabled, setEnabled] = useState(item?.enabled ?? true);
  const metadata = messageStoreMetadataSchema.safeParse({ description, text, enabled });
  const save = useMutation({
    mutationFn: () => {
      if (!metadata.success) throw new Error('Check the description and message text.');
      return adminApi.saveMessageStore(item?.id, metadata.data);
    },
    onSuccess: async () => { await client.invalidateQueries({ queryKey }); onClose(); },
  });

  return <Dialog open fullWidth maxWidth="md" onClose={() => { if (!save.isPending) onClose(); }}>
    <DialogTitle>{item ? t('Edit saved reply') : t('Add saved reply')}</DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography color="text.secondary">{t('Save exact owner-written text. The description guides selection and is never sent to clients.')}</Typography>
        <TextField label={t('Suitable situation or client question')} multiline minRows={2} value={description} disabled={save.isPending} onChange={(event) => setDescription(event.target.value)} inputProps={{ maxLength: 2000 }} helperText={`${description.length.toLocaleString(language === 'uk' ? 'uk-UA' : 'en-US')} / 2,000 ${t('characters')}`} />
        <TextField label={t('Exact reply text')} multiline minRows={8} value={text} disabled={save.isPending} onChange={(event) => setText(event.target.value)} inputProps={{ maxLength: 4000 }} helperText={`${text.length.toLocaleString(language === 'uk' ? 'uk-UA' : 'en-US')} / 4,000 ${t('characters')}`} />
        <FormControlLabel control={<Switch checked={enabled} disabled={save.isPending} onChange={(_, checked) => setEnabled(checked)} />} label={t('Available to assistant')} />
        {save.isError && <Alert severity="error">{t('Could not save the reply.')}{t(' ')}{t(errorMessage(save.error))}</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions><Button onClick={onClose} disabled={save.isPending}>{t('Cancel')}</Button><Button variant="contained" disabled={!metadata.success || save.isPending} onClick={() => save.mutate()}>{save.isPending ? t('Saving…') : t('Save')}</Button></DialogActions>
  </Dialog>;
}

export function MessageStore() {
  const { t } = useI18n();
  const client = useQueryClient();
  const query = useQuery({ queryKey, queryFn: adminApi.messageStore });
  const [editor, setEditor] = useState<MessageStoreDto | 'new'>();
  const [deleting, setDeleting] = useState<MessageStoreDto>();
  const [importResult, setImportResult] = useState<{ imported: number; existing: number }>();
  const remove = useMutation({ mutationFn: adminApi.deleteMessageStore, onSuccess: async () => { await client.invalidateQueries({ queryKey }); setDeleting(undefined); } });
  const importStarters = useMutation({
    mutationFn: adminApi.importMessageStoreStarters,
    onSuccess: async (result) => { setImportResult(result); await client.invalidateQueries({ queryKey }); },
  });

  return <Stack spacing={2} sx={{ pb: 4 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1.5}>
      <Typography color="text.secondary">{t('Keep reusable replies exactly as written. The assistant uses one only when it directly answers and current facts allow it.')}</Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Button variant="outlined" disabled={importStarters.isPending} onClick={() => { setImportResult(undefined); importStarters.mutate(); }}>{importStarters.isPending ? t('Importing…') : t('Import reviewed replies')}</Button>
        <Button variant="contained" onClick={() => setEditor('new')}>{t('Add reply')}</Button>
      </Stack>
    </Stack>
    {importResult && <Alert severity="success">{t('Imported {imported} saved replies; {existing} already existed.', importResult)}</Alert>}
    {importStarters.isError && <Alert severity="error">{t('Could not import starter replies.')}{t(' ')}{t(errorMessage(importStarters.error))}</Alert>}
    {query.isPending && <CircularProgress aria-label={t('Loading saved replies')} />}
    {query.isError && <Alert severity="error" action={<Button onClick={() => void query.refetch()}>{t('Retry')}</Button>}>{t('Could not load saved replies.')}{t(' ')}{t(errorMessage(query.error))}</Alert>}
    {query.data?.length === 0 && <Alert severity="info">{t('No saved replies yet. Import reviewed replies or add one.')}</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
      {query.data?.map((item) => <Card key={item.id} variant="outlined">
        <CardContent>
          <Stack spacing={1.25}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
              <Typography fontWeight={650} sx={{ overflowWrap: 'anywhere' }}>{item.description}</Typography>
              <Chip size="small" label={item.enabled ? t('Enabled') : t('Disabled')} color={item.enabled ? 'success' : 'default'} />
            </Stack>
            <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.text}</Typography>
          </Stack>
        </CardContent>
        <CardActions>
          <Button onClick={() => setEditor(item)}>{t('Edit')}</Button>
          <Button color="error" onClick={() => { remove.reset(); setDeleting(item); }}>{t('Delete')}</Button>
        </CardActions>
      </Card>)}
    </Box>
    {editor && <MessageEditor item={editor === 'new' ? undefined : editor} onClose={() => setEditor(undefined)} />}
    <Dialog open={Boolean(deleting)} onClose={() => { if (!remove.isPending) setDeleting(undefined); }}>
      <DialogTitle>{t('Delete saved reply?')}</DialogTitle>
      <DialogContent>
        <Typography>{t('This removes the reply from Message Store. Messages already sent remain in client chats.')}</Typography>
        {remove.isError && <Alert severity="error" sx={{ mt: 2 }}>{t('Could not delete the reply.')}{t(' ')}{t(errorMessage(remove.error))}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={remove.isPending} onClick={() => setDeleting(undefined)}>{t('Cancel')}</Button>
        <Button color="error" disabled={remove.isPending} onClick={() => { if (deleting) remove.mutate(deleting.id); }}>{remove.isPending ? t('Deleting…') : t('Delete')}</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}
