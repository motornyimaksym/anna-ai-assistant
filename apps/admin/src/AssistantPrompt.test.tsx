// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssistantPrompt } from './AssistantPrompt.js';
import { adminApi } from './api.js';

vi.mock('./api.js', () => ({ adminApi: { promptCatalog: vi.fn(async () => ({ systemOne: [
  { id: 'handoff', label: 'Handoff', description: 'Human handoff', content: 'Handoff instructions' },
], systemTwo: [
  { id: 'assistant', label: 'Assistant', description: 'All replies', content: 'Assistant instructions' },
 ], systemTwoV2: [
  { id: 'assistant-v2', label: 'Assistant v2', description: 'Uses archive search', content: 'Pretend you are a person. Existing chat history: $link' },
 ] })), prompt: vi.fn(async (id: string) => ({ prompt: `${id} default`, isCustom: false })), savePrompt: vi.fn(async (_id: string, prompt: string) => ({ prompt, isCustom: true })), resetPrompt: vi.fn(async (id: string) => ({ prompt: `${id} default`, isCustom: false })) } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.mocked(adminApi.prompt).mockImplementation(async (id) => ({ prompt: `${id} default`, isCustom: false })); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })}><AssistantPrompt /></QueryClientProvider>);
const openSystemTwo = () => fireEvent.click(screen.getByRole('tab', { name: 'System Two' }));

describe('admin assistant prompt page', () => {
  it('loads the active prompt and saves an edited prompt', async () => {
    show();
    openSystemTwo();
    const editor = await screen.findByRole('textbox', { name: 'Assistant instructions' });
    expect((editor as HTMLTextAreaElement).value).toBe('assistant default');
    expect(screen.getByText(/System Two writes replies and can book a confirmed appointment/)).toBeTruthy();
    expect(screen.getAllByText(/Changes apply to the next request/).length).toBeGreaterThan(0);
    fireEvent.change(editor, { target: { value: 'Use short replies.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Assistant prompt' }));
    await waitFor(() => expect(adminApi.savePrompt).toHaveBeenCalledWith('assistant', 'Use short replies.'));
    expect(await screen.findByText('Saved. Changes apply to the next request.')).toBeTruthy();
  });
  it('allows editing a default Assistant prompt longer than 12,000 characters', async () => {
    const longDefault = 'x'.repeat(13_802);
    vi.mocked(adminApi.prompt).mockImplementation(async (id) => ({ prompt: id === 'assistant' ? longDefault : `${id} default`, isCustom: false }));
    show();
    openSystemTwo();
    const editor = await screen.findByRole('textbox', { name: 'Assistant instructions' });
    expect((editor as HTMLTextAreaElement).value).toHaveLength(13_802);
    fireEvent.change(editor, { target: { value: `${longDefault} revised` } });
    const save = screen.getByRole('button', { name: 'Save Assistant prompt' });
    expect(save.hasAttribute('disabled')).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(adminApi.savePrompt).toHaveBeenCalledWith('assistant', `${longDefault} revised`));
  });

  it('resets a custom prompt to the default', async () => {
    vi.mocked(adminApi.prompt).mockImplementation(async (id) => ({ prompt: id === 'assistant' ? 'Custom prompt' : `${id} default`, isCustom: id === 'assistant' }));
    show();
    openSystemTwo();
    const reset = await screen.findByRole('button', { name: 'Reset Assistant prompt' });
    fireEvent.click(reset);
    await waitFor(() => expect(adminApi.resetPrompt).toHaveBeenCalledWith('assistant'));
    expect(await screen.findByText('Reset to the default prompt.')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Assistant instructions' }) as HTMLTextAreaElement).value).toBe('assistant default');
  });

  it('rejects whitespace-only draft without saving', async () => {
    show();
    openSystemTwo();
    const editor = await screen.findByRole('textbox', { name: 'Assistant instructions' });
    fireEvent.change(editor, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Save Assistant prompt' }).hasAttribute('disabled')).toBe(true);
  });
  it('shows only merged prompts and preserves drafts between systems', async () => {
    show();
    const editor = await screen.findByRole('textbox', { name: 'Handoff instructions' });
    expect(screen.queryByRole('tab', { name: 'Routing' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Approval' })).toBeNull();
    fireEvent.change(editor, { target: { value: 'Handoff draft' } });
    openSystemTwo();
    expect(await screen.findByRole('textbox', { name: 'Assistant instructions' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Booking planner' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'System One' }));
    expect((screen.getByRole('textbox', { name: 'Handoff instructions' }) as HTMLTextAreaElement).value).toBe('Handoff draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save Handoff prompt' }));
    await waitFor(() => expect(adminApi.savePrompt).toHaveBeenCalledWith('handoff', 'Handoff draft'));
  });

  it('switches prompt view to the read-only V2 template with a link placeholder', async () => {
    show();
    openSystemTwo();
    await screen.findByRole('textbox', { name: 'Assistant instructions' });
    fireEvent.click(screen.getByRole('button', { name: 'v2' }));
    const preview = await screen.findByRole('textbox', { name: 'Assistant v2 instructions' }) as HTMLTextAreaElement;
    expect(preview.value).toContain('Pretend you are a person');
    expect(preview.value).toContain('$link');
    expect(preview.hasAttribute('readonly')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save Assistant v2 prompt' })).toBeNull();
  });
});
