// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScheduleSourceSettings } from './ScheduleSourceSettings.js';
import { ScheduleSyncStatus } from './ScheduleSyncStatus.js';
import { adminApi } from './api.js';
vi.mock('./api.js', () => ({ adminApi: { telegramScheduleSlots: vi.fn(), telegramScheduleChats: vi.fn(), telegramScheduleTopics: vi.fn(), selectScheduleSource: vi.fn(), refreshSchedule: vi.fn() } }));
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
    await waitFor(() => expect(adminApi.selectScheduleSource).toHaveBeenCalledWith('99', undefined));
    expect(await screen.findByText(/Source saved/)).toBeTruthy();
  });
  it('shows failure and enables manual retry despite the automatic cooldown', () => {
    show(<ScheduleSyncStatus data={{ slots: [], status: 'account_busy', lastAttemptAt: new Date().toISOString(), nextAttemptAt: new Date(Date.now() + 300000).toISOString() }} enableManualRetries />);
    expect(screen.getByText(/Telegram account is busy/)).toBeTruthy();
    expect(screen.getByText(/Last attempt/)).toBeTruthy(); expect(screen.getByText(/Last synced: Never/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry now' }).hasAttribute('disabled')).toBe(false);
    expect(adminApi.refreshSchedule).not.toHaveBeenCalled();
  });
  it('requests retry mode only from the Settings refresh button', async () => {
    show(<ScheduleSyncStatus data={{ slots: [], status: 'idle' }} enableManualRetries />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    await waitFor(() => expect(adminApi.refreshSchedule).toHaveBeenCalledWith(true));
  });

  it('leaves retry mode off for the /schedule refresh button', async () => {
    show(<ScheduleSyncStatus data={{ slots: [], status: 'idle' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    await waitFor(() => expect(adminApi.refreshSchedule).toHaveBeenCalledWith(false));
  });

  it('keeps the schedule page refresh on its existing cooldown', () => {
    show(<ScheduleSyncStatus data={{ slots: [], status: 'connection_failed', nextAttemptAt: new Date(Date.now() + 300_000).toISOString() }} />);
    expect(screen.getByRole('button', { name: 'Refresh now' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows manual retry backoff while the refresh request runs', async () => {
    let finish!: (value: { slots: []; status: 'success' }) => void;
    vi.mocked(adminApi.refreshSchedule).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    show(<ScheduleSyncStatus data={{ slots: [], status: 'connection_failed', nextAttemptAt: new Date(Date.now() + 300_000).toISOString() }} enableManualRetries />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(await screen.findByText(/up to 5 attempts with 10, 20, 30, then 40 second waits/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refreshing…' }).hasAttribute('disabled')).toBe(true);
    finish({ slots: [], status: 'success' });
  });
});

it('loads inner topics for a forum, searches by name, and saves the parent/topic pair', async () => {
  vi.mocked(adminApi.telegramScheduleChats).mockResolvedValue({ chats: [{ id: '-10042', title: 'LUSH MASSAGE', kind: 'group', isForum: true }], truncated: false });
  vi.mocked(adminApi.telegramScheduleTopics).mockResolvedValue({ topics: [{ id: 42, title: 'Календар' }], truncated: true });
  show(<ScheduleSourceSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Load Telegram chats' }));
  fireEvent.change(await screen.findByRole('combobox', { name: 'Schedule chat' }), { target: { value: 'LUSH' } });
  fireEvent.click(await screen.findByRole('option', { name: /LUSH MASSAGE/ }));
  await waitFor(() => expect(adminApi.telegramScheduleTopics).toHaveBeenCalledWith('-10042', ''));
  expect(await screen.findByText(/More topics available/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Find topic by name'), { target: { value: 'Календар' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search topics' }));
  await waitFor(() => expect(adminApi.telegramScheduleTopics).toHaveBeenCalledWith('-10042', 'Календар'));
  const input = screen.getByRole('combobox', { name: 'Schedule topic' });
  await waitFor(() => expect(input.hasAttribute('disabled')).toBe(false));
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Календар' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Календар · topic · 42' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save schedule source' }));
  await waitFor(() => expect(adminApi.selectScheduleSource).toHaveBeenCalledWith('-10042', 42));
});

it('clears topic selection when changing the parent chat', async () => {
  vi.mocked(adminApi.telegramScheduleChats).mockResolvedValue({ chats: [{ id: '-10042', title: 'Forum', kind: 'group', isForum: true }, { id: '99', title: 'Private', kind: 'private' }], truncated: false });
  vi.mocked(adminApi.telegramScheduleTopics).mockResolvedValue({ topics: [{ id: 42, title: 'Topic' }], truncated: false });
  show(<ScheduleSourceSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Load Telegram chats' }));
  const parent = await screen.findByRole('combobox', { name: 'Schedule chat' });
  fireEvent.change(parent, { target: { value: 'Forum' } });
  fireEvent.click(await screen.findByRole('option', { name: /Forum ·/ }));
  const topic = await screen.findByRole('combobox', { name: 'Schedule topic' });
  await waitFor(() => expect(topic.hasAttribute('disabled')).toBe(false));
  fireEvent.focus(topic);
  fireEvent.change(topic, { target: { value: 'Topic' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Topic · topic · 42' }));
  fireEvent.focus(parent);
  fireEvent.change(parent, { target: { value: 'Private' } });
  fireEvent.click(await screen.findByRole('option', { name: /Private ·/ }));
  expect(screen.queryByRole('combobox', { name: 'Schedule topic' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save schedule source' }));
  await waitFor(() => expect(adminApi.selectScheduleSource).toHaveBeenCalledWith('99', undefined));
});
