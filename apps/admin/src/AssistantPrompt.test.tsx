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
], systemTwo: [
  { id: 'general', label: 'General', description: 'General replies', content: 'General instructions' },
  { id: 'booking-conversation', label: 'Booking conversation', description: 'Booking workflow', content: 'Booking instructions' },
  { id: 'booking-planner', label: 'Booking planner', description: 'Structured planning', content: 'Planner instructions' },
 ] })), prompt: vi.fn(async (id: string) => ({ prompt: `${id} default`, isCustom: false })), savePrompt: vi.fn(async (_id: string, prompt: string) => ({ prompt, isCustom: true })), resetPrompt: vi.fn(async (id: string) => ({ prompt: `${id} default`, isCustom: false })), routingPrompt: vi.fn(async () => ({ instructions: 'Routing default', general: 'General default', booking: 'Booking default', isCustom: false })), saveRoutingPrompt: vi.fn(async (value) => ({ ...value, isCustom: true })), resetRoutingPrompt: vi.fn(async () => ({ instructions: 'Routing default', general: 'General default', booking: 'Booking default', isCustom: false })) } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.mocked(adminApi.prompt).mockImplementation(async (id) => ({ prompt: `${id} default`, isCustom: false })); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })}><AssistantPrompt /></QueryClientProvider>);
const openSystemTwo = () => fireEvent.click(screen.getByRole('tab', { name: 'System Two' }));

describe('admin assistant prompt page', () => {
  it('loads the active prompt and saves an edited prompt', async () => {
    show();
    openSystemTwo();
    const editor = await screen.findByRole('textbox', { name: 'General instructions' });
    expect((editor as HTMLTextAreaElement).value).toBe('general default');
    expect(screen.getByText(/System One automatically selects/)).toBeTruthy();
    expect(screen.getAllByText(/Changes apply to the next request/).length).toBeGreaterThan(0);
    fireEvent.change(editor, { target: { value: 'Use short replies.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save General prompt' }));
    await waitFor(() => expect(adminApi.savePrompt).toHaveBeenCalledWith('general', 'Use short replies.'));
    expect(await screen.findByText('Saved. Changes apply to the next request.')).toBeTruthy();
  });

  it('resets a custom prompt to the default', async () => {
    vi.mocked(adminApi.prompt).mockImplementation(async (id) => ({ prompt: id === 'general' ? 'Custom prompt' : `${id} default`, isCustom: id === 'general' }));
    show();
    openSystemTwo();
    const reset = await screen.findByRole('button', { name: 'Reset General prompt' });
    fireEvent.click(reset);
    await waitFor(() => expect(adminApi.resetPrompt).toHaveBeenCalledWith('general'));
    expect(await screen.findByText('Reset to the default prompt.')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'General instructions' }) as HTMLTextAreaElement).value).toBe('general default');
  });

  it('edits the booking prompt without changing the conversation prompt', async () => {
    show();
    openSystemTwo();
    fireEvent.click(await screen.findByRole('tab', { name: 'Booking planner' }));
    const editor = await screen.findByRole('textbox', { name: 'Booking planner instructions' });
    fireEvent.change(editor, { target: { value: 'Booking rules' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Booking planner prompt' }));
    await waitFor(() => expect(adminApi.savePrompt).toHaveBeenCalledWith('booking-planner', 'Booking rules'));
    fireEvent.click(screen.getByRole('tab', { name: 'General' }));
    expect((screen.getByRole('textbox', { name: 'General instructions' }) as HTMLTextAreaElement).value).toBe('general default');
  });
  it('rejects whitespace-only draft without saving', async () => {
    show();
    openSystemTwo();
    const editor = await screen.findByRole('textbox', { name: 'General instructions' });
    fireEvent.change(editor, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Save General prompt' }).hasAttribute('disabled')).toBe(true);
  });
  it('shows every prompt tab and preserves an unsaved draft while switching systems', async () => {
    show();
    expect(await screen.findByRole('tab', { name: 'Routing' })).toBeTruthy();
    for (const name of ['Approval', 'Probability']) expect(screen.getByRole('tab', { name })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Approval' }));
    expect((await screen.findByRole('textbox', { name: 'Approval instructions' }) as HTMLTextAreaElement).value).toBe('approval default');
    openSystemTwo();
    for (const name of ['General', 'Booking conversation', 'Booking planner']) expect(screen.getByRole('tab', { name })).toBeTruthy();
    const editor = await screen.findByRole('textbox', { name: 'General instructions' });
    fireEvent.change(editor, { target: { value: 'Unsaved draft' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Booking conversation' }));
    expect((await screen.findByRole('textbox', { name: 'Booking conversation instructions' }) as HTMLTextAreaElement).readOnly).toBe(false);
    fireEvent.click(screen.getByRole('tab', { name: 'System One' }));
    fireEvent.click(screen.getByRole('tab', { name: 'System Two' }));
    fireEvent.click(screen.getByRole('tab', { name: 'General' }));
    expect((screen.getByRole('textbox', { name: 'General instructions' }) as HTMLTextAreaElement).value).toBe('Unsaved draft');
  });
  it('saves and resets newly editable System One and Booking conversation prompts', async () => {
    show();
    for (const [label, id] of [['Approval', 'approval'], ['Probability', 'probability']] as const) {
      fireEvent.click(await screen.findByRole('tab', { name: label }));
      const editor = await screen.findByRole('textbox', { name: `${label} instructions` });
      fireEvent.change(editor, { target: { value: `Custom ${id}` } });
      fireEvent.click(screen.getByRole('button', { name: `Save ${label} prompt` }));
      await waitFor(() => expect(adminApi.savePrompt).toHaveBeenCalledWith(id, `Custom ${id}`));
      fireEvent.click(screen.getByRole('button', { name: `Reset ${label} prompt` }));
      await waitFor(() => expect(adminApi.resetPrompt).toHaveBeenCalledWith(id));
    }
    openSystemTwo();
    fireEvent.click(screen.getByRole('tab', { name: 'Booking conversation' }));
    const editor = await screen.findByRole('textbox', { name: 'Booking conversation instructions' });
    fireEvent.change(editor, { target: { value: 'Custom booking conversation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Booking conversation prompt' }));
    await waitFor(() => expect(adminApi.savePrompt).toHaveBeenCalledWith('booking-conversation', 'Custom booking conversation'));
  });
  it('edits separate routing instructions and Choice criteria', async () => {
    show();
    const instructions = await screen.findByRole('textbox', { name: 'Routing instructions' });
    const general = screen.getByRole('textbox', { name: 'General criteria' });
    const booking = screen.getByRole('textbox', { name: 'Booking criteria' });
    fireEvent.change(instructions, { target: { value: 'Choose workflow' } });
    fireEvent.change(general, { target: { value: 'Questions about services' } });
    fireEvent.change(booking, { target: { value: 'Appointment requests' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Routing prompt' }));
    await waitFor(() => expect(adminApi.saveRoutingPrompt).toHaveBeenCalledWith({ instructions: 'Choose workflow', general: 'Questions about services', booking: 'Appointment requests' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset Routing prompt' }));
    await waitFor(() => expect(adminApi.resetRoutingPrompt).toHaveBeenCalled());
  });
});
