// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Bookings } from './Bookings.js';
import { adminApi } from './api.js';
vi.mock('./api.js', () => ({ adminApi: { bookings: vi.fn(), services: vi.fn(async () => [{ id: 'demo', name: 'Demo massage' }]) } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><Bookings /></QueryClientProvider>);
describe('admin bookings', () => {
  it('shows persisted booking details with service names and Kyiv time', async () => {
    vi.mocked(adminApi.bookings).mockResolvedValue([{ id: 'booking-123', clientId: '61785', serviceId: 'demo', startAt: '2026-09-25T07:00:00.000Z', endAt: '2026-09-25T08:00:00.000Z', status: 'confirmed', telegramChatId: '61785', calendarSyncStatus: 'pending', createdAt: '2026-09-24T00:00:00.000Z', updatedAt: '2026-09-24T00:00:00.000Z' }]);
    show();
    expect(await screen.findByText('booking-123')).toBeTruthy();
    expect(await screen.findByText('Demo massage')).toBeTruthy();
    expect(screen.getByText(/25.09.2026, 10:00/)).toBeTruthy();
    expect(screen.getByText('confirmed')).toBeTruthy();
    expect(screen.getByText('60 min · Price not recorded')).toBeTruthy();
  });
  it('displays the booked duration and price snapshot', async () => {
    vi.mocked(adminApi.bookings).mockResolvedValue([{ id: 'snapshot', clientId: '61785', serviceId: 'demo', durationMinutes: 90, price: 2000, currency: 'UAH', startAt: '2026-09-25T07:00:00.000Z', endAt: '2026-09-25T08:30:00.000Z', status: 'confirmed', telegramChatId: '61785', calendarSyncStatus: 'pending', createdAt: '2026-09-24T00:00:00.000Z', updatedAt: '2026-09-24T00:00:00.000Z' }]);
    show();
    expect(await screen.findByText('90 min · 2000 UAH')).toBeTruthy();
  });
  it('explains empty booking storage', async () => {
    vi.mocked(adminApi.bookings).mockResolvedValue([]);
    show();
    expect(await screen.findByText(/No bookings yet/)).toBeTruthy();
  });
  it('shows fetch failures instead of an empty table', async () => {
    vi.mocked(adminApi.bookings).mockRejectedValue(new Error('Denied'));
    show();
    expect(await screen.findByText(/Could not load bookings/)).toBeTruthy();
  });
});
