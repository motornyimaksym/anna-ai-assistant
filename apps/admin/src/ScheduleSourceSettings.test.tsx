// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScheduleSourceSettings } from './ScheduleSourceSettings.js';
import { ScheduleSyncStatus } from './ScheduleSyncStatus.js';
import { adminApi } from './api.js';
vi.mock('./api.js', () => ({ adminApi: { telegramScheduleSlots: vi.fn(), telegramScheduleChats: vi.fn(), selectScheduleSource: vi.fn(), refreshSchedule: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => {
  vi.mocked(adminApi.telegramScheduleSlots).mockResolvedValue({ slots: [], status: 'source_not_found' });
  vi.mocked(adminApi.telegramScheduleChats).mockResolvedValue({ chats: [{ id: '99', title: 'My calendar', kind: 'private' }], truncated: false });
  vi.mocked(adminApi.selectScheduleSource).mockResolvedValue({ slots: [], status: 'idle', sourcePeerId: '99', sourceChatTitle: 'My calendar' });
  vi.mocked(adminApi.refreshSchedule).mockResolvedValue({ slots: [], status: 'success', syncedAt: new Date().toISOString() });
});
const show = (node: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>{node}</QueryClientProvider>);
describe('schedule source and diagnostics', () => {
  it('lists private chats on demand and saves only the chosen ID', async () => {
    show(<ScheduleSourceSettings />);
    expect(await screen.findByText(/Source chat was not found/)).toBeTruthy();
    expect(adminApi.telegramScheduleChats).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Load Telegram chats' }));
    const input = await screen.findByRole('combobox');
    fireEvent.change(input, { target: { value: 'My calendar' } });
    fireEvent.click(await screen.findByRole('option', { name: 'My calendar · private · 99' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule source' }));
    await waitFor(() => expect(adminApi.selectScheduleSource).toHaveBeenCalledWith('99', expect.anything()));
    expect(await screen.findByText(/Source saved/)).toBeTruthy();
  });
  it('shows failure, attempt/success timestamps and disables refresh during cooldown', () => {
    show(<ScheduleSyncStatus data={{ slots: [], status: 'account_busy', lastAttemptAt: new Date().toISOString(), nextAttemptAt: new Date(Date.now() + 300000).toISOString() }} />);
    expect(screen.getByText(/Telegram account is busy/)).toBeTruthy();
    expect(screen.getByText(/Last attempt/)).toBeTruthy(); expect(screen.getByText(/Last synced: Never/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh now' }).hasAttribute('disabled')).toBe(true);
    expect(adminApi.refreshSchedule).not.toHaveBeenCalled();
  });
  it('manually refreshes without passing bypass arguments', async () => {
    show(<ScheduleSyncStatus data={{ slots: [], status: 'idle' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    await waitFor(() => expect(adminApi.refreshSchedule).toHaveBeenCalledOnce());
  });
});
