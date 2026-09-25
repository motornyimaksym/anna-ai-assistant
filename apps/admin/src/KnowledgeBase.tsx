import { Alert, Box, Button, Chip, Divider, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { adminApi } from './api.js';

const queryKey = ['knowledge-base'];
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';
const priceOptions = (service: { durationMinutes: number; durationOptions?: { durationMinutes: number; price: number }[]; price: number; currency: string }) => [
  { durationMinutes: service.durationMinutes, price: service.price },
  ...(service.durationOptions ?? []),
];

export const KnowledgeBase = () => {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey, queryFn: adminApi.knowledgeBase });
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { if (query.data) setContent(query.data.content); }, [query.data]);

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

  if (query.isPending) return <Typography>Loading knowledge base…</Typography>;
  if (query.isError) return <Alert severity="error">Could not load the knowledge base. {errorText(query.error)}</Alert>;

  const dirty = content !== query.data.content;
  const canSave = dirty && content.trim().length > 0 && content.length <= 12_000 && !save.isPending && !reset.isPending;

  return <Stack spacing={2}>
    <Stack direction="row" alignItems="center" spacing={1}>
      <Chip size="small" color={query.data.isCustom ? 'primary' : 'default'} label={query.data.isCustom ? 'Custom knowledge base' : 'Default knowledge base'} />
      <Typography variant="body2" color="text.secondary">Changes apply to the next assistant request.</Typography>
    </Stack>
    <Typography color="text.secondary">Add business facts and guidance here. Keep response rules in Assistant prompt. Current enabled services, descriptions, durations, and prices are appended automatically from the booking catalog.</Typography>
    <TextField
      label="Additional business knowledge"
      value={content}
      onChange={(event) => { setContent(event.target.value); setMessage(''); }}
      multiline
      minRows={18}
      fullWidth
      inputProps={{ maxLength: 12_000, 'aria-label': 'Additional business knowledge' }}
      helperText={`${content.length.toLocaleString()} / 12,000 characters`}
      disabled={save.isPending || reset.isPending}
    />
    {query.data.services.length > 0 && <>
      <Divider />
      <Box>
        <Typography variant="h6" gutterBottom>Services automatically included</Typography>
        <Stack spacing={1.5}>
          {query.data.services.map((service) => <Box key={service.id}>
            <Typography fontWeight={600}>{service.name}</Typography>
            {service.description && <Typography variant="body2" color="text.secondary">{service.description}</Typography>}
            <Typography variant="body2">{priceOptions(service).map((option) => `${option.durationMinutes} min - ${option.price} ${service.currency}`).join(' · ')}</Typography>
          </Box>)}
        </Stack>
      </Box>
    </>}
    {message && <Alert severity="success">{message}</Alert>}
    {save.isError && <Alert severity="error">Could not save the knowledge base. {errorText(save.error)}</Alert>}
    {reset.isError && <Alert severity="error">Could not reset the knowledge base. {errorText(reset.error)}</Alert>}
    <Box display="flex" gap={1}>
      <Button variant="contained" onClick={() => { setMessage(''); save.mutate(); }} disabled={!canSave}>Save</Button>
      <Button variant="outlined" color="inherit" onClick={() => { setMessage(''); reset.mutate(); }} disabled={!query.data.isCustom || save.isPending || reset.isPending}>RESET</Button>
    </Box>
  </Stack>;
};
