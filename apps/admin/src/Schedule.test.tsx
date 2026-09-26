// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Schedule } from './Schedule.js';
import { adminApi } from './api.js';

vi.mock('./api.js', () => ({ adminApi: { telegramScheduleSlots: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><Schedule /></QueryClientProvider>);

describe('imported schedule slots', () => {
  it('shows recent chat messages as read-only slots', async () => {
    vi.mocked(adminApi.telegramScheduleSlots).mockResolvedValue({
      sourceChatTitle: 'Календар та планування часу', syncedAt: '2026-09-25T10:00:00.000Z',
      slots: [{ messageId: '17', text: 'Сьогодні 15:00', createdAt: '2026-09-25T09:30:00.000Z' }],
    });
    show();
    expect(await screen.findByText('Сьогодні 15:00')).toBeTruthy();
    expect(screen.getByText(/Календар та планування часу/)).toBeTruthy();
    expect(screen.getByText(/Last synced/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh now' })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows an empty state before any sync succeeds', async () => {
    vi.mocked(adminApi.telegramScheduleSlots).mockResolvedValue({ slots: [] });
    show();
    expect(await screen.findByText(/No imported free slots yet/)).toBeTruthy();
  });
});
