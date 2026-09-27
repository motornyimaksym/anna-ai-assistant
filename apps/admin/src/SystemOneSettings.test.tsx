// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SystemOneSettings } from './SystemOneSettings.js';
import { adminApi } from './api.js';
vi.mock('./api.js', () => ({ adminApi: { systemOneSettings: vi.fn(), saveSystemOneSettings: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><SystemOneSettings /></QueryClientProvider>);
describe('System One settings', () => {
  it('saves an explicit provider choice and restores it after reload', async () => {
    vi.mocked(adminApi.systemOneSettings).mockResolvedValue({ provider: 'openai' });
    vi.mocked(adminApi.saveSystemOneSettings).mockResolvedValue({ provider: 'typesafe' });
    const view = show();
    const selector = await screen.findByRole('combobox', { name: 'System One provider' });
    fireEvent.change(selector, { target: { value: 'typesafe' } });
    expect(adminApi.saveSystemOneSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save provider' }));
    await waitFor(() => expect(adminApi.saveSystemOneSettings).toHaveBeenCalledWith({ provider: 'typesafe' }, expect.anything()));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Saved. The next System One decision will use this provider.');
    view.unmount();
    vi.mocked(adminApi.systemOneSettings).mockResolvedValue({ provider: 'typesafe' });
    show();
    expect((await screen.findByRole('combobox') as HTMLSelectElement).value).toBe('typesafe');
  });
  it('shows save errors without losing the selected draft', async () => {
    vi.mocked(adminApi.systemOneSettings).mockResolvedValue({ provider: 'openai' });
    vi.mocked(adminApi.saveSystemOneSettings).mockRejectedValue(new Error('Offline'));
    show();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'typesafe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save provider' }));
    expect(await screen.findByText(/Could not save provider/)).toBeTruthy();
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('typesafe');
  });
  it('shows load failure with retry instead of an editable default', async () => {
    vi.mocked(adminApi.systemOneSettings).mockRejectedValue(new Error('Offline'));
    show();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    vi.mocked(adminApi.systemOneSettings).mockResolvedValue({ provider: 'openai' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('combobox')).toBeTruthy();
  });
});
