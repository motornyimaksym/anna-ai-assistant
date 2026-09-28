// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KnowledgeBase } from './KnowledgeBase.js';
import { adminApi } from './api.js';

vi.mock('./api.js', () => ({ adminApi: { knowledgeBase: vi.fn(), saveKnowledgeBase: vi.fn(), resetKnowledgeBase: vi.fn(), services: vi.fn(), saveService: vi.fn(), deleteService: vi.fn() } }));
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
    vi.mocked(adminApi.resetKnowledgeBase).mockResolvedValue({ content: 'Default facts.', isCustom: false, services: [] });
    show();
    const editor = await screen.findByRole('textbox', { name: 'Additional business knowledge' });
    fireEvent.change(editor, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(editor, { target: { value: 'Custom notes.' } });
    fireEvent.click(screen.getByRole('button', { name: 'RESET' }));
    await waitFor(() => expect(adminApi.resetKnowledgeBase).toHaveBeenCalledOnce());
    expect(await screen.findByText('Reset to the default knowledge base.')).toBeTruthy();
    expect((editor as HTMLTextAreaElement).value).toBe('Default facts.');
  });

  it('edits an automatically included service without changing the knowledge text or other service fields', async () => {
    const service = { id: 'relax', name: 'Relax massage', description: 'Gentle massage', durationMinutes: 60, durationOptions: [{ durationMinutes: 90, price: 2000 }], price: 1500, currency: 'UAH', bufferMinutes: 30, enabled: true, photoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/photo' };
    vi.mocked(adminApi.knowledgeBase).mockResolvedValue({ content: 'Studio is upstairs.', isCustom: true, services: [{ id: service.id, name: service.name, description: service.description, durationMinutes: service.durationMinutes, durationOptions: service.durationOptions, price: service.price, currency: service.currency }] });
    vi.mocked(adminApi.services).mockResolvedValue([service]);
    vi.mocked(adminApi.saveService).mockImplementation(async (value) => value);
    show();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Additional business knowledge' }), { target: { value: 'Unsaved knowledge draft.' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Relax massage' }));
    const description = await screen.findByRole('textbox', { name: 'Description for assistant' });
    fireEvent.change(description, { target: { value: 'Updated massage' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Option 2 price' }), { target: { value: '2200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save service' }));
    await waitFor(() => expect(adminApi.saveService).toHaveBeenCalledWith({ ...service, description: 'Updated massage', durationOptions: [{ durationMinutes: 90, price: 2200 }] }, false));
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Additional business knowledge' }) as HTMLTextAreaElement).value).toBe('Unsaved knowledge draft.'));
    expect(await screen.findByText(/90 min - 2200 UAH/)).toBeTruthy();
  });

  it('adds a new service to the catalog and automatically included list', async () => {
    vi.mocked(adminApi.knowledgeBase).mockResolvedValue({ content: 'Studio facts.', isCustom: true, services: [] });
    vi.mocked(adminApi.saveService).mockImplementation(async (value) => value);
    show();
    expect(await screen.findByText(/No enabled services/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add service' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Service name' }), { target: { value: 'Relax massage' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Price' }), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save service' }));
    await waitFor(() => expect(adminApi.saveService).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Relax massage', description: '', durationMinutes: 60, bufferMinutes: 30, price: 1500, currency: 'UAH', enabled: true,
    }), true));
    expect(await screen.findByText('Relax massage')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Additional business knowledge' })).toBeTruthy());
    expect((screen.getByRole('textbox', { name: 'Additional business knowledge' }) as HTMLTextAreaElement).value).toBe('Studio facts.');
  });

  it('requires delete confirmation, deletes the service, and keeps knowledge text intact', async () => {
    const service = { id: 'relax', name: 'Relax massage', description: 'Gentle massage', durationMinutes: 60, price: 1500, currency: 'UAH' };
    vi.mocked(adminApi.knowledgeBase).mockResolvedValue({ content: 'Studio facts.', isCustom: true, services: [service] });
    vi.mocked(adminApi.deleteService).mockResolvedValue({ ok: true });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Relax massage' }));
    expect(await screen.findByRole('heading', { name: 'Delete Relax massage?' })).toBeTruthy();
    expect(screen.getByText(/Existing appointments remain unchanged/)).toBeTruthy();
    expect(adminApi.deleteService).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete service' }));
    await waitFor(() => expect(adminApi.deleteService).toHaveBeenCalledWith('relax'));
    expect(await screen.findByText(/No enabled services/)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Additional business knowledge' })).toBeTruthy());
    expect((screen.getByRole('textbox', { name: 'Additional business knowledge' }) as HTMLTextAreaElement).value).toBe('Studio facts.');
  });
});
