// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleCalendarSettings } from './GoogleCalendarSettings.js';
import { adminApi } from './api.js';
vi.mock('./api.js', () => ({ adminApi: { googleCalendar: vi.fn(), startGoogleCalendar: vi.fn(), googleCalendars: vi.fn(), selectGoogleCalendar: vi.fn(), checkGoogleCalendar: vi.fn(), disconnectGoogleCalendar: vi.fn() } }));
const connected = { configured: true, phase: 'connected' as const, legacy: false, email: 'anna.lush.massage@gmail.com', calendarId: 'anna.lush.massage@gmail.com', calendarTitle: 'Anna' };
beforeEach(() => {
  vi.mocked(adminApi.googleCalendar).mockResolvedValue(connected);
  vi.mocked(adminApi.googleCalendars).mockResolvedValue([{ id: 'anna.lush.massage@gmail.com', title: 'Anna', primary: true }]);
  vi.mocked(adminApi.selectGoogleCalendar).mockResolvedValue(connected);
  vi.mocked(adminApi.disconnectGoogleCalendar).mockResolvedValue({ configured: true, phase: 'disconnected', legacy: false });
  vi.mocked(adminApi.checkGoogleCalendar).mockResolvedValue(connected);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><GoogleCalendarSettings /></QueryClientProvider>);
describe('Calendar Settings', () => {
  it('explains missing setup and prevents starting an unconfigured flow', async () => {
    vi.mocked(adminApi.googleCalendar).mockResolvedValue({ configured: false, phase: 'disconnected', legacy: false }); show();
    expect(await screen.findByText(/setup is incomplete/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect Google Calendar' }).hasAttribute('disabled')).toBe(true);
    expect(adminApi.googleCalendars).not.toHaveBeenCalled();
  });
  it('shows the account and calendar, allows selection and checks without creating an event', async () => {
    show(); expect(await screen.findByText(/Status: connected/)).toBeTruthy();
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Google calendar' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Anna (primary) · anna.lush.massage@gmail.com' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use selected calendar' }));
    await waitFor(() => expect(adminApi.selectGoogleCalendar).toHaveBeenCalledWith('anna.lush.massage@gmail.com', expect.anything()));
    await screen.findByText(/Calendar selected/);
    fireEvent.click(screen.getByRole('button', { name: 'Check Calendar connection' }));
    expect(await screen.findByText('Google Calendar connection verified.')).toBeTruthy();
  });
  it('requires disconnect confirmation and preserves a failed connection for retry', async () => {
    vi.mocked(adminApi.disconnectGoogleCalendar).mockRejectedValue(new Error('Connection retained; try again.'));
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Google Calendar' }));
    expect(adminApi.disconnectGoogleCalendar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm disconnect' }));
    expect(await screen.findByText('Connection retained; try again.')).toBeTruthy();
    expect(screen.getByText(/Status: connected/)).toBeTruthy();
  });
});
