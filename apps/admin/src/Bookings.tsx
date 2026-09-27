import { Alert, Box, Button, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from './api.js';
export const Bookings = () => {
  const cache = useQueryClient();
  const retry = useMutation({ mutationFn: adminApi.retryBooking, onSuccess: () => cache.invalidateQueries({ queryKey: ['bookings'] }) });
  const query = useQuery({ queryKey: ['bookings'], queryFn: adminApi.bookings, refetchInterval: 15_000 });
  const services = useQuery({ queryKey: ['services'], queryFn: adminApi.services });
  return <Box>
    <Button onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh bookings</Button>
    <Typography variant="body2" sx={{ my: 2 }}>Times in Europe/Kyiv. Bookings saved in the app; Calendar sync may be pending.</Typography>
    {retry.error && <Alert severity="error">{retry.error.message}</Alert>}
    {query.isPending ? <Typography>Loading bookings…</Typography> : query.isError ? <Alert severity="error">Could not load bookings. Try refreshing.</Alert> : !query.data.length ? <Alert severity="info">No bookings yet. Confirm a booking in Telegram to see it here.</Alert> :
      <TableContainer><Table aria-label="Bookings"><TableHead><TableRow>{['Time (Kyiv)', 'Service', 'Duration / price', 'Client', 'Status', 'Calendar', 'Booking ID'].map((title) => <TableCell key={title}>{title}</TableCell>)}</TableRow></TableHead><TableBody>
        {query.data.map((booking) => <TableRow key={booking.id}>
          <TableCell>{new Date(booking.startAt).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}</TableCell>
          <TableCell>{services.data?.find((service) => service.id === booking.serviceId)?.name ?? booking.serviceId}</TableCell>
          <TableCell>{booking.durationMinutes ?? (Date.parse(booking.endAt) - Date.parse(booking.startAt)) / 60_000} min · {booking.price === undefined ? 'Price not recorded' : `${booking.price} ${booking.currency ?? ''}`}</TableCell>
          <TableCell>{booking.clientId}</TableCell><TableCell><Chip size="small" label={booking.status} /></TableCell><TableCell>{booking.calendarSyncStatus}{booking.calendarOperation && <Box>Pending {booking.calendarOperation}. Slots remain reserved.<Button disabled={retry.isPending} onClick={() => retry.mutate(booking.id)}>Retry after review</Button></Box>}</TableCell><TableCell>{booking.id}</TableCell>
        </TableRow>)}
      </TableBody></Table></TableContainer>}
  </Box>;
};
