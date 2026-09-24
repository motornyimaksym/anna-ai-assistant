import { Alert, Box, Button, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from './api.js';
export const Bookings = () => {
  const query = useQuery({ queryKey: ['bookings'], queryFn: adminApi.bookings, refetchInterval: 15_000 });
  const services = useQuery({ queryKey: ['services'], queryFn: adminApi.services });
  return <Box>
    <Button onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh bookings</Button>
    <Typography variant="body2" sx={{ my: 2 }}>Times in Europe/Kyiv. Bookings saved in the app; Calendar sync may be pending.</Typography>
    {query.isPending ? <Typography>Loading bookings…</Typography> : query.isError ? <Alert severity="error">Could not load bookings. Try refreshing.</Alert> : !query.data.length ? <Alert severity="info">No bookings yet. Confirm a booking in Telegram to see it here.</Alert> :
      <TableContainer><Table aria-label="Bookings"><TableHead><TableRow>{['Time (Kyiv)', 'Service', 'Client', 'Status', 'Calendar', 'Booking ID'].map((title) => <TableCell key={title}>{title}</TableCell>)}</TableRow></TableHead><TableBody>
        {query.data.map((booking) => <TableRow key={booking.id}>
          <TableCell>{new Date(booking.startAt).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}</TableCell>
          <TableCell>{services.data?.find((service) => service.id === booking.serviceId)?.name ?? booking.serviceId}</TableCell>
          <TableCell>{booking.clientId}</TableCell><TableCell><Chip size="small" label={booking.status} /></TableCell><TableCell>{booking.calendarSyncStatus}</TableCell><TableCell>{booking.id}</TableCell>
        </TableRow>)}
      </TableBody></Table></TableContainer>}
  </Box>;
};
