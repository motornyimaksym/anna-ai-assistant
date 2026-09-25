// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KnowledgeBase } from './KnowledgeBase.js';
import { adminApi } from './api.js';

vi.mock('./api.js', () => ({ adminApi: { knowledgeBase: vi.fn(), saveKnowledgeBase: vi.fn(), resetKnowledgeBase: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })}><KnowledgeBase /></QueryClientProvider>);

describe('admin knowledge base page', () => {
  it('shows live service prices and saves additional facts', async () => {
    vi.mocked(adminApi.knowledgeBase).mockResolvedValue({ content: 'Studio is upstairs.', isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z', services: [{ id: 'relax', name: 'Relax massage', description: 'Gentle full body massage', durationMinutes: 60, durationOptions: [{ durationMinutes: 90, price: 2000 }], price: 1500, currency: 'UAH' }] });
    vi.mocked(adminApi.saveKnowledgeBase).mockResolvedValue({ content: 'Studio is upstairs. Parking is available.', isCustom: true, updatedAt: '2026-09-24T10:05:00.000Z', services: [] });
    show();
    const editor = await screen.findByRole('textbox', { name: 'Additional business knowledge' });
    expect((editor as HTMLTextAreaElement).value).toBe('Studio is upstairs.');
    expect(screen.getByText('60 min - 1500 UAH · 90 min - 2000 UAH')).toBeTruthy();
    fireEvent.change(editor, { target: { value: 'Studio is upstairs. Parking is available.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(adminApi.saveKnowledgeBase).toHaveBeenCalledWith('Studio is upstairs. Parking is available.'));
    expect(await screen.findByText('Saved. Changes apply to the next assistant request.')).toBeTruthy();
  });

  it('resets saved knowledge and disallows whitespace-only drafts', async () => {
    vi.mocked(adminApi.knowledgeBase).mockResolvedValue({ content: 'Custom notes.', isCustom: true, services: [] });
    vi.mocked(adminApi.resetKnowledgeBase).mockResolvedValue({ content: '', isCustom: false, services: [] });
    show();
    const editor = await screen.findByRole('textbox', { name: 'Additional business knowledge' });
    fireEvent.change(editor, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(editor, { target: { value: 'Custom notes.' } });
    fireEvent.click(screen.getByRole('button', { name: 'RESET' }));
    await waitFor(() => expect(adminApi.resetKnowledgeBase).toHaveBeenCalledOnce());
    expect(await screen.findByText('Reset to the empty default knowledge base.')).toBeTruthy();
  });
});
