// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssistantPrompt } from './AssistantPrompt.js';
import { adminApi } from './api.js';

vi.mock('./api.js', () => ({ adminApi: { assistantPrompt: vi.fn(), saveAssistantPrompt: vi.fn(), resetAssistantPrompt: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })}><AssistantPrompt /></QueryClientProvider>);

describe('admin assistant prompt page', () => {
  it('loads the active prompt and saves an edited prompt', async () => {
    vi.mocked(adminApi.assistantPrompt).mockResolvedValue({ prompt: 'Default prompt', isCustom: false });
    vi.mocked(adminApi.saveAssistantPrompt).mockResolvedValue({ prompt: 'Use short replies.', isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' });
    show();
    const editor = await screen.findByRole('textbox', { name: 'Assistant system prompt' });
    expect((editor as HTMLTextAreaElement).value).toBe('Default prompt');
    expect(screen.getByText('Changes apply to the next assistant message.')).toBeTruthy();
    fireEvent.change(editor, { target: { value: 'Use short replies.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(adminApi.saveAssistantPrompt).toHaveBeenCalledWith('Use short replies.'));
    expect(await screen.findByText('Saved. Changes apply to the next assistant message.')).toBeTruthy();
  });

  it('resets a custom prompt to the default', async () => {
    vi.mocked(adminApi.assistantPrompt).mockResolvedValue({ prompt: 'Custom prompt', isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' });
    vi.mocked(adminApi.resetAssistantPrompt).mockResolvedValue({ prompt: 'Default prompt', isCustom: false });
    show();
    const reset = await screen.findByRole('button', { name: 'RESET' });
    fireEvent.click(reset);
    await waitFor(() => expect(adminApi.resetAssistantPrompt).toHaveBeenCalledOnce());
    expect(await screen.findByText('Reset to the repository default prompt.')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Assistant system prompt' }) as HTMLTextAreaElement).value).toBe('Default prompt');
  });

  it('rejects whitespace-only draft without saving', async () => {
    vi.mocked(adminApi.assistantPrompt).mockResolvedValue({ prompt: 'Default prompt', isCustom: false });
    show();
    const editor = await screen.findByRole('textbox', { name: 'Assistant system prompt' });
    fireEvent.change(editor, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  });
});
