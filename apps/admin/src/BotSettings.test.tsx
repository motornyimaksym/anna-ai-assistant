// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BotSettings } from './BotSettings.js';
import { adminApi } from './api.js';

vi.mock('./api.js', () => ({ adminApi: { botSettings: vi.fn(), saveBotSettings: vi.fn(), adminAccess: vi.fn(), saveAdminAccess: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => { vi.mocked(adminApi.adminAccess).mockResolvedValue({ emails: [], canManage: false }); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })}><BotSettings /></QueryClientProvider>);

describe('admin bot settings page', () => {
  it('loads current values and saves timing changes', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, isCustom: false });
    vi.mocked(adminApi.saveBotSettings).mockResolvedValue({ maxReadDelayMs: 900, typingDelayPerSymbolMs: 350, isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' });
    show();
    const readDelay = await screen.findByRole('spinbutton', { name: 'Maximum read delay (seconds)' });
    const typingDelay = screen.getByRole('spinbutton', { name: 'Typing delay per symbol (ms)' });
    expect((readDelay as HTMLInputElement).value).toBe('2');
    expect(readDelay.getAttribute('max')).toBe('3540');
    expect(readDelay.getAttribute('step')).toBe('0.001');
    expect(screen.getByText('Random delay before reading a Business message: 0–3,540 seconds (up to 59 minutes).')).toBeTruthy();
    expect((typingDelay as HTMLInputElement).value).toBe('600');

    fireEvent.change(readDelay, { target: { value: '3540' } });
    fireEvent.change(typingDelay, { target: { value: '350' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(adminApi.saveBotSettings).toHaveBeenCalledWith({ maxReadDelayMs: 3540000, typingDelayPerSymbolMs: 350 }));
    expect(await screen.findByText('Saved. Changes apply to the next incoming message.')).toBeTruthy();
  });

  it('prevents saving values beyond documented limits', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, isCustom: false });
    show();
    const readDelay = await screen.findByRole('spinbutton', { name: 'Maximum read delay (seconds)' });
    fireEvent.change(readDelay, { target: { value: '3541' } });
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  });

  it('converts fractional seconds to milliseconds', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, isCustom: false });
    vi.mocked(adminApi.saveBotSettings).mockResolvedValue({ maxReadDelayMs: 750, typingDelayPerSymbolMs: 600, isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' });
    show();
    const readDelay = await screen.findByRole('spinbutton', { name: 'Maximum read delay (seconds)' });
    fireEvent.change(readDelay, { target: { value: '0.75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(adminApi.saveBotSettings).toHaveBeenCalledWith({ maxReadDelayMs: 750, typingDelayPerSymbolMs: 600 }));
  });

  it('lets the owner add and save stakeholder email grants', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, isCustom: false });
    vi.mocked(adminApi.adminAccess).mockResolvedValue({ emails: ['existing@example.com'], canManage: true });
    vi.mocked(adminApi.saveAdminAccess).mockResolvedValue({ emails: ['existing@example.com', 'partner@example.com'], canManage: true, updatedAt: '2026-09-24T10:00:00.000Z' });
    show();
    expect(await screen.findByText('existing@example.com')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Stakeholder email' }), { target: { value: ' Partner@Example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add email' }));
    expect(await screen.findByText('partner@example.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save stakeholder access' }));
    await waitFor(() => expect(adminApi.saveAdminAccess).toHaveBeenCalledWith(['existing@example.com', 'partner@example.com']));
  });

  it('shows the granted list without edit controls for stakeholders', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, isCustom: false });
    vi.mocked(adminApi.adminAccess).mockResolvedValue({ emails: ['stakeholder@example.com'], canManage: false });
    show();
    expect(await screen.findByText('stakeholder@example.com')).toBeTruthy();
    expect(screen.getByText('Only the owner can change stakeholder access.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add email' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save stakeholder access' })).toBeNull();
  });
});
