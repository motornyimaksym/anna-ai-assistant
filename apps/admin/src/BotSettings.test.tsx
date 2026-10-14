// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BotSettings } from './BotSettings.js';
import { adminApi } from './api.js';
import { LocaleProvider } from './i18n.js';

vi.mock('./api.js', () => ({ adminApi: { systemOneSettings: vi.fn(async () => ({ provider: 'openai' })), botSettings: vi.fn(), saveBotSettings: vi.fn(), humanAssistanceSettings: vi.fn(), saveHumanAssistanceSettings: vi.fn(), adminAccess: vi.fn(), saveAdminAccess: vi.fn(), telegramAccount: vi.fn(), telegramAccountAction: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => { vi.mocked(adminApi.adminAccess).mockResolvedValue({ emails: [], canManage: false }); vi.mocked(adminApi.humanAssistanceSettings).mockResolvedValue({ thresholdPercent: 60, responders: [] }); vi.mocked(adminApi.telegramAccount).mockResolvedValue({ configured: false, phase: 'disconnected' }); });
const show = () => render(<LocaleProvider><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })}><BotSettings /></QueryClientProvider></LocaleProvider>);
const openTab = async (label: string) => fireEvent.click(await screen.findByRole('tab', { name: label }));

describe('admin bot settings page', () => {
  it('prevents pointer-wheel changes to timing fields', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, discloseAiIdentity: true, isCustom: false });
    show();
    await screen.findByRole('spinbutton', { name: 'Maximum read delay (seconds)' });
    for (const name of ['Maximum read delay (seconds)', 'Typing delay per symbol (ms)']) {
      const input = screen.getByRole('spinbutton', { name }) as HTMLInputElement;
      input.focus();
      const before = input.value;
      fireEvent.wheel(input, { deltaY: -100 });
      expect(input.value).toBe(before);
      expect(document.activeElement).not.toBe(input);
    }
  });

  it('loads current values and saves timing changes', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, discloseAiIdentity: true, isCustom: false });
    vi.mocked(adminApi.saveBotSettings).mockResolvedValue({ maxReadDelayMs: 900, typingDelayPerSymbolMs: 350, testerUsernames: [], allUsersEnabled: false, discloseAiIdentity: true, isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' });
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
    fireEvent.click(screen.getByRole('button', { name: 'Save bot settings' }));
    await waitFor(() => expect(adminApi.saveBotSettings).toHaveBeenCalledWith({ maxReadDelayMs: 3540000, typingDelayPerSymbolMs: 350, testerUsernames: [], allUsersEnabled: false, discloseAiIdentity: true }));
    expect((screen.getByRole('switch', { name: 'Disclose AI identity when asked directly' }) as HTMLInputElement).checked).toBe(true);
    expect(await screen.findByText('Saved. Changes apply to the next incoming message.')).toBeTruthy();
  });

  it('prevents saving values beyond documented limits', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, discloseAiIdentity: true, isCustom: false });
    show();
    const readDelay = await screen.findByRole('spinbutton', { name: 'Maximum read delay (seconds)' });
    fireEvent.change(readDelay, { target: { value: '3541' } });
    expect(screen.getByRole('button', { name: 'Save bot settings' }).hasAttribute('disabled')).toBe(true);
  });

  it('converts fractional seconds to milliseconds', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, discloseAiIdentity: true, isCustom: false });
    vi.mocked(adminApi.saveBotSettings).mockResolvedValue({ maxReadDelayMs: 750, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, discloseAiIdentity: true, isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' });
    show();
    const readDelay = await screen.findByRole('spinbutton', { name: 'Maximum read delay (seconds)' });
    fireEvent.change(readDelay, { target: { value: '0.75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save bot settings' }));
    await waitFor(() => expect(adminApi.saveBotSettings).toHaveBeenCalledWith({ maxReadDelayMs: 750, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, discloseAiIdentity: true }));
  });

  it('adds and removes Telegram testers and saves normalized usernames', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: ['user61785'], allUsersEnabled: false, discloseAiIdentity: true, isCustom: false });
    vi.mocked(adminApi.saveBotSettings).mockImplementation(async (settings) => ({ ...settings, isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' }));
    show();
    await openTab('Telegram access');
    expect(await screen.findByText('user61785')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Tester username' }), { target: { value: ' @AnotherUser ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add tester' }));
    expect(await screen.findByText('anotheruser')).toBeTruthy();
    const removeTester = screen.getByText('user61785').parentElement?.querySelector('.MuiChip-deleteIcon');
    expect(removeTester).not.toBeNull();
    fireEvent.click(removeTester!);
    fireEvent.click(screen.getByRole('button', { name: 'Save bot settings' }));
    await waitFor(() => expect(adminApi.saveBotSettings).toHaveBeenCalledWith({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: ['anotheruser'], allUsersEnabled: false, discloseAiIdentity: true }));
  });

  it('shows validation error and blocks duplicate tester usernames', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: ['user61785'], allUsersEnabled: false, discloseAiIdentity: true, isCustom: false });
    show();
    await openTab('Telegram access');
    await screen.findByText('user61785');
    fireEvent.change(screen.getByRole('textbox', { name: 'Tester username' }), { target: { value: '@USER61785' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add tester' }));
    expect(await screen.findByText('Telegram usernames must be unique')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save bot settings' }).hasAttribute('disabled')).toBe(true);
  });

  it('lets the owner add and save stakeholder email grants', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, discloseAiIdentity: true, isCustom: false });
    vi.mocked(adminApi.adminAccess).mockResolvedValue({ emails: ['existing@example.com'], canManage: true });
    vi.mocked(adminApi.saveAdminAccess).mockResolvedValue({ emails: ['existing@example.com', 'partner@example.com'], canManage: true, updatedAt: '2026-09-24T10:00:00.000Z' });
    show();
    await openTab('Team access');
    expect(await screen.findByText('existing@example.com')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Stakeholder email' }), { target: { value: ' Partner@Example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add email' }));
    expect(await screen.findByText('partner@example.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save stakeholder access' }));
    await waitFor(() => expect(adminApi.saveAdminAccess).toHaveBeenCalledWith(['existing@example.com', 'partner@example.com']));
  });

  it('shows the granted list without edit controls for stakeholders', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, discloseAiIdentity: true, isCustom: false });
    vi.mocked(adminApi.adminAccess).mockResolvedValue({ emails: ['stakeholder@example.com'], canManage: false });
    show();
    await openTab('Team access');
    expect(await screen.findByText('stakeholder@example.com')).toBeTruthy();
    expect(screen.getByText('Only the owner can change stakeholder access.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add email' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save stakeholder access' })).toBeNull();
  });

  it('saves all-users mode alongside existing bot settings', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: ['user61785'], allUsersEnabled: false, discloseAiIdentity: true, isCustom: true });
    vi.mocked(adminApi.saveBotSettings).mockImplementation(async (settings) => ({ ...settings, isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' }));
    show();
    await openTab('Telegram access');
    fireEvent.click(await screen.findByRole('switch', { name: 'Reply to all users' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save bot settings' }));
    await waitFor(() => expect(adminApi.saveBotSettings).toHaveBeenCalledWith({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: ['user61785'], allUsersEnabled: true, discloseAiIdentity: true }));
  });

  it('saves AI disclosure preference', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, discloseAiIdentity: true, isCustom: false });
    vi.mocked(adminApi.saveBotSettings).mockImplementation(async (settings) => ({ ...settings, allUsersEnabled: settings.allUsersEnabled ?? false, discloseAiIdentity: settings.discloseAiIdentity ?? true, isCustom: true }));
    show();
    fireEvent.click(await screen.findByRole('switch', { name: 'Disclose AI identity when asked directly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save bot settings' }));
    await waitFor(() => expect(adminApi.saveBotSettings).toHaveBeenCalledWith({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, discloseAiIdentity: false }));
  });

  it('keeps draft changes when switching tabs and explains shared save scope', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, discloseAiIdentity: true, isCustom: false });
    vi.mocked(adminApi.saveBotSettings).mockImplementation(async (settings) => ({ ...settings, isCustom: true }));
    show();
    const typingDelay = await screen.findByRole('spinbutton', { name: 'Typing delay per symbol (ms)' });
    fireEvent.change(typingDelay, { target: { value: '350' } });
    expect(screen.getByRole('tabpanel', { name: 'Assistant' })).toBeTruthy();
    expect(screen.getByText('Changes from Assistant and Telegram access tabs are saved together.')).toBeTruthy();

    await openTab('Telegram access');
    fireEvent.click(await screen.findByRole('switch', { name: 'Reply to all users' }));
    await openTab('Assistant');
    expect((screen.getByRole('spinbutton', { name: 'Typing delay per symbol (ms)' }) as HTMLInputElement).value).toBe('350');
    fireEvent.click(screen.getByRole('button', { name: 'Save bot settings' }));
    await waitFor(() => expect(adminApi.saveBotSettings).toHaveBeenCalledWith({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 350, testerUsernames: [], allUsersEnabled: true, discloseAiIdentity: true }));
  });

  it('keeps independent provider drafts when switching tabs', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, discloseAiIdentity: true, isCustom: false });
    show();
    const provider = await screen.findByRole('combobox', { name: 'System One provider' });
    fireEvent.change(provider, { target: { value: 'typesafe' } });
    await openTab('Telegram access');
    await openTab('Assistant');
    expect((screen.getByRole('combobox', { name: 'System One provider' }) as HTMLSelectElement).value).toBe('typesafe');
  });

  it('shows owner connections only to the owner', async () => {
    vi.mocked(adminApi.botSettings).mockResolvedValue({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, testerUsernames: [], allUsersEnabled: false, discloseAiIdentity: true, isCustom: false });
    vi.mocked(adminApi.adminAccess).mockResolvedValue({ emails: [], canManage: true });
    show();
    await openTab('Connections');
    expect(await screen.findByText('Calendar owner settings')).toBeTruthy();
    expect(screen.getByRole('tabpanel', { name: 'Connections' })).toBeTruthy();
  });
});

vi.mock('./GoogleCalendarSettings.js', () => ({ GoogleCalendarSettings: () => <div>Calendar owner settings</div> }));
