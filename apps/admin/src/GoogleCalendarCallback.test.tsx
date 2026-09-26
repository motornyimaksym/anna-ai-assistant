// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { adminApi } from './api.js';
vi.mock('./api.js', () => ({ adminApi: { completeGoogleCalendar: vi.fn(async () => ({ configured: true, phase: 'connected', legacy: false })) } }));
vi.mock('./auth.js', () => ({ signIn: vi.fn() }));
afterEach(() => cleanup());
describe('Calendar callback', () => {
  it('removes OAuth parameters and waits for owner authentication before submitting once', async () => {
    window.history.replaceState({}, '', `/google-calendar/callback?state=${'a'.repeat(43)}&code=transient-code`);
    const { GoogleCalendarCallback } = await import('./GoogleCalendarCallback.js');
    expect(window.location.search).toBe('');
    const view = render(<MemoryRouter><GoogleCalendarCallback user={null} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Sign in as owner' })).toBeTruthy();
    expect(adminApi.completeGoogleCalendar).not.toHaveBeenCalled();
    view.rerender(<MemoryRouter><GoogleCalendarCallback user={{ uid: 'owner' } as never} /></MemoryRouter>);
    await waitFor(() => expect(adminApi.completeGoogleCalendar).toHaveBeenCalledWith({ state: 'a'.repeat(43), code: 'transient-code' }));
    expect(await screen.findByText(/Google account connected/)).toBeTruthy();
    view.rerender(<MemoryRouter><GoogleCalendarCallback user={{ uid: 'owner' } as never} /></MemoryRouter>);
    expect(adminApi.completeGoogleCalendar).toHaveBeenCalledOnce();
  });
});
