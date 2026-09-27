// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssistantPrompt } from './AssistantPrompt.js';
import { adminApi } from './api.js';

vi.mock('./api.js', () => ({ adminApi: { promptCatalog: vi.fn(async () => ({ systemOne: [
  { id: 'routing', label: 'Routing', description: 'Select workflow', content: 'Routing instructions' },
  { id: 'approval', label: 'Approval', description: 'Approve proposal', content: 'Approval instructions' },
  { id: 'probability', label: 'Probability', description: 'Estimate probability', content: 'Probability instructions' },
], systemTwo: [{ id: 'booking-conversation', label: 'Booking conversation', description: 'Booking workflow', content: 'Booking instructions' }] })), assistantPrompt: vi.fn(), saveAssistantPrompt: vi.fn(), resetAssistantPrompt: vi.fn(), bookingPrompt: vi.fn(async () => ({ prompt: 'Booking default', isCustom: false })), saveBookingPrompt: vi.fn(), resetBookingPrompt: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })}><AssistantPrompt /></QueryClientProvider>);
const openSystemTwo = () => fireEvent.click(screen.getByRole('tab', { name: 'System Two' }));

describe('admin assistant prompt page', () => {
  it('loads the active prompt and saves an edited prompt', async () => {
    vi.mocked(adminApi.assistantPrompt).mockResolvedValue({ prompt: 'Default prompt', isCustom: false });
    vi.mocked(adminApi.saveAssistantPrompt).mockResolvedValue({ prompt: 'Use short replies.', isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' });
    show();
    openSystemTwo();
    const editor = await screen.findByRole('textbox', { name: 'General prompt' });
    expect((editor as HTMLTextAreaElement).value).toBe('Default prompt');
    expect(screen.getByText(/System One automatically selects/)).toBeTruthy();
    expect(screen.getByText('Changes apply to the next General response.')).toBeTruthy();
    fireEvent.change(editor, { target: { value: 'Use short replies.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(adminApi.saveAssistantPrompt).toHaveBeenCalledWith('Use short replies.'));
    expect(await screen.findByText('Saved. Changes apply to the next General response.')).toBeTruthy();
  });

  it('resets a custom prompt to the default', async () => {
    vi.mocked(adminApi.assistantPrompt).mockResolvedValue({ prompt: 'Custom prompt', isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' });
    vi.mocked(adminApi.resetAssistantPrompt).mockResolvedValue({ prompt: 'Default prompt', isCustom: false });
    show();
    openSystemTwo();
    const reset = await screen.findByRole('button', { name: 'RESET' });
    fireEvent.click(reset);
    await waitFor(() => expect(adminApi.resetAssistantPrompt).toHaveBeenCalledOnce());
    expect(await screen.findByText('Reset to the repository default prompt.')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'General prompt' }) as HTMLTextAreaElement).value).toBe('Default prompt');
  });

  it('edits the booking prompt without changing the conversation prompt', async () => {
    vi.mocked(adminApi.assistantPrompt).mockResolvedValue({ prompt: 'General prompt', isCustom: false });
    vi.mocked(adminApi.saveBookingPrompt).mockResolvedValue({ prompt: 'Booking rules', isCustom: true });
    show();
    openSystemTwo();
    fireEvent.click(screen.getByRole('tab', { name: 'Booking planner' }));
    const editor = await screen.findByRole('textbox', { name: 'Booking prompt' });
    fireEvent.change(editor, { target: { value: 'Booking rules' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save booking prompt' }));
    await waitFor(() => expect(adminApi.saveBookingPrompt).toHaveBeenCalledWith('Booking rules'));
    expect(adminApi.saveAssistantPrompt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'General' }));
    expect((screen.getByRole('textbox', { name: 'General prompt' }) as HTMLTextAreaElement).value).toBe('General prompt');
  });
  it('rejects whitespace-only draft without saving', async () => {
    vi.mocked(adminApi.assistantPrompt).mockResolvedValue({ prompt: 'Default prompt', isCustom: false });
    show();
    openSystemTwo();
    const editor = await screen.findByRole('textbox', { name: 'General prompt' });
    fireEvent.change(editor, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  });
  it('shows every prompt tab and preserves an unsaved draft while switching systems', async () => {
    vi.mocked(adminApi.assistantPrompt).mockResolvedValue({ prompt: 'Default prompt', isCustom: false });
    show();
    expect(await screen.findByRole('tab', { name: 'Routing' })).toBeTruthy();
    for (const name of ['Approval', 'Probability']) expect(screen.getByRole('tab', { name })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Approval' }));
    expect((screen.getByRole('textbox', { name: 'Approval instructions' }) as HTMLTextAreaElement).value).toBe('Approval instructions');
    openSystemTwo();
    for (const name of ['General', 'Booking conversation', 'Booking planner']) expect(screen.getByRole('tab', { name })).toBeTruthy();
    const editor = await screen.findByRole('textbox', { name: 'General prompt' });
    fireEvent.change(editor, { target: { value: 'Unsaved draft' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Booking conversation' }));
    expect((screen.getByRole('textbox', { name: 'Booking conversation instructions' }) as HTMLTextAreaElement).readOnly).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'System One' }));
    fireEvent.click(screen.getByRole('tab', { name: 'System Two' }));
    fireEvent.click(screen.getByRole('tab', { name: 'General' }));
    expect((screen.getByRole('textbox', { name: 'General prompt' }) as HTMLTextAreaElement).value).toBe('Unsaved draft');
  });
});
