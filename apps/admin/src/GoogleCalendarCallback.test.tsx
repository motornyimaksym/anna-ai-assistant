// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { adminApi } from './api.js';
vi.mock('./api.js', () => ({ adminApi: { completeGoogleCalendar: vi.fn(async () => ({ configured: true, phase: 'connected', legacy: false })) } }));
vi.mock('./auth.js', () => ({ signIn: vi.fn() }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('Calendar callback', () => {
  it('removes OAuth parameters, waits for owner authentication, then returns to settings after five seconds', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', `/google-calendar/callback?state=${'a'.repeat(43)}&code=transient-code`);
    const { GoogleCalendarCallback } = await import('./GoogleCalendarCallback.js');
    expect(window.location.search).toBe('');
    const page = (user: { uid: string } | null) => <MemoryRouter initialEntries={['/google-calendar/callback']}><Routes>
      <Route path="/google-calendar/callback" element={<GoogleCalendarCallback user={user as never} />} />
      <Route path="/bot-settings" element={<p>Bot Settings destination</p>} />
    </Routes></MemoryRouter>;
    const view = render(page(null));
    expect(screen.getByRole('button', { name: 'Sign in as owner' })).toBeTruthy();
    expect(adminApi.completeGoogleCalendar).not.toHaveBeenCalled();
    view.rerender(page({ uid: 'owner' }));
    await act(async () => { await Promise.resolve(); });
    expect(adminApi.completeGoogleCalendar).toHaveBeenCalledWith({ state: 'a'.repeat(43), code: 'transient-code' });
    expect(screen.getByRole('heading', { name: 'Google Calendar connected' })).toBeTruthy();
    expect(screen.getByText('Returning to Bot Settings in 5 seconds.')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(4999); });
    expect(screen.queryByText('Bot Settings destination')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText('Bot Settings destination')).toBeTruthy();
    expect(adminApi.completeGoogleCalendar).toHaveBeenCalledOnce();
  });
});
