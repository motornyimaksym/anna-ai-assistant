// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TelegramAccountSettings } from './TelegramAccountSettings.js';
import { adminApi } from './api.js';
vi.mock('./api.js', () => ({ adminApi: { telegramAccount: vi.fn(), telegramAccountAction: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><TelegramAccountSettings /></QueryClientProvider>);
describe('Telegram account settings', () => {
  it('requires consent and international phone before starting', async () => {
    vi.mocked(adminApi.telegramAccount).mockResolvedValue({ configured: true, phase: 'disconnected' });
    vi.mocked(adminApi.telegramAccountAction).mockResolvedValue({ configured: true, phase: 'code', maskedPhone: '••••4567' });
    show();
    const send = await screen.findByRole('button', { name: 'Send login code' });
    expect(send.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Telegram phone number' }), { target: { value: '+380501234567' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(send);
    await waitFor(() => expect(adminApi.telegramAccountAction).toHaveBeenCalledWith('start', { phone: '+380501234567' }));
    expect(await screen.findByRole('textbox', { name: 'Telegram login code' })).toBeTruthy();
  });
  it('asks for 2FA password and clears it after submission', async () => {
    vi.mocked(adminApi.telegramAccount).mockResolvedValue({ configured: true, phase: 'password', maskedPhone: '••••4567' });
    vi.mocked(adminApi.telegramAccountAction).mockResolvedValue({ configured: true, phase: 'connected', username: 'owner' });
    show();
    const field = await screen.findByLabelText('Telegram two-step verification password');
    fireEvent.change(field, { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Authorize account' }));
    await waitFor(() => expect(adminApi.telegramAccountAction).toHaveBeenCalledWith('password', { password: 'secret' }));
    expect(await screen.findByText('Telegram account connected.')).toBeTruthy();
    expect(screen.queryByLabelText('Telegram two-step verification password')).toBeNull();
  });
  it('shows configuration gap without login controls', async () => {
    vi.mocked(adminApi.telegramAccount).mockResolvedValue({ configured: false, phase: 'disconnected' });
    show();
    expect(await screen.findByText('Telegram account connection is not configured. Contact the administrator.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send login code' })).toBeNull();
  });
});
