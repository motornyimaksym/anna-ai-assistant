// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BotSettings } from './BotSettings.js';
import { adminApi } from './api.js';

vi.mock('./api.js', () => ({ adminApi: { botSettings: vi.fn(), saveBotSettings: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })}><BotSettings /></QueryClientProvider>);

describe('admin bot settings page', () => {
  it('loads current values and saves timing changes', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, isCustom: false });
    vi.mocked(adminApi.saveBotSettings).mockResolvedValue({ maxReadDelayMs: 900, typingDelayPerSymbolMs: 350, isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' });
    show();
    const readDelay = await screen.findByRole('spinbutton', { name: 'Maximum read delay (ms)' });
    const typingDelay = screen.getByRole('spinbutton', { name: 'Typing delay per symbol (ms)' });
    expect((readDelay as HTMLInputElement).value).toBe('2000');
    expect((typingDelay as HTMLInputElement).value).toBe('600');

    fireEvent.change(readDelay, { target: { value: '900' } });
    fireEvent.change(typingDelay, { target: { value: '350' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(adminApi.saveBotSettings).toHaveBeenCalledWith({ maxReadDelayMs: 900, typingDelayPerSymbolMs: 350 }));
    expect(await screen.findByText('Saved. Changes apply to the next incoming message.')).toBeTruthy();
  });

  it('prevents saving values beyond documented limits', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, isCustom: false });
    show();
    const readDelay = await screen.findByRole('spinbutton', { name: 'Maximum read delay (ms)' });
    fireEvent.change(readDelay, { target: { value: '10001' } });
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  });
});
