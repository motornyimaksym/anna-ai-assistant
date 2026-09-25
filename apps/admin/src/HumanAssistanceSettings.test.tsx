// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HumanAssistanceSettings } from './HumanAssistanceSettings.js';
import { adminApi } from './api.js';

vi.mock('./api.js', () => ({ adminApi: { humanAssistanceSettings: vi.fn(), saveHumanAssistanceSettings: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><HumanAssistanceSettings /></QueryClientProvider>);

describe('human assistance settings', () => {
  it('shows threshold, signup requirement and saves normalized responders', async () => {
    vi.mocked(adminApi.humanAssistanceSettings).mockResolvedValue({ thresholdPercent: 60, responders: [] });
    vi.mocked(adminApi.saveHumanAssistanceSettings).mockResolvedValue({ thresholdPercent: 60, responders: [{ username: 'helper123', connected: false }] });
    show();
    expect(await screen.findByText('Human assistance threshold: 60%')).toBeTruthy();
    expect(screen.getByText(/Each responder must send \/start/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Telegram username' }), { target: { value: '@Helper123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add responder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save human assistance' }));
    await waitFor(() => expect(adminApi.saveHumanAssistanceSettings).toHaveBeenCalledWith({ thresholdPercent: 60, usernames: ['helper123'] }));
  });
});
