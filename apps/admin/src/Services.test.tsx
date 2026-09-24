// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Services } from './Services.js';
import { adminApi } from './api.js';

const service = { id: 'massage-60', name: 'Massage 60 min', description: 'Relaxing full-body massage.', durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH', enabled: true };
vi.mock('./api.js', () => ({ adminApi: { services: vi.fn(), saveService: vi.fn(), uploadServicePhoto: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })}><Services /></QueryClientProvider>);

describe('admin service catalog editor', () => {
  it('edits service details and applies Telegram caption formatting', async () => {
    vi.mocked(adminApi.services).mockResolvedValue([service]);
    vi.mocked(adminApi.saveService).mockResolvedValue({ ...service, name: 'Classic massage' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Massage 60 min' }));
    const name = await screen.findByRole('textbox', { name: 'Service name' });
    fireEvent.change(name, { target: { value: 'Classic massage' } });
    const caption = screen.getByRole('textbox', { name: 'Telegram caption' }) as HTMLTextAreaElement;
    fireEvent.change(caption, { target: { value: 'Classic massage for relaxation' } });
    caption.setSelectionRange(0, 7);
    fireEvent.select(caption);
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Link URL' }), { target: { value: 'https://example.com/service' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add URL button' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Button 1.1 text' }), { target: { value: 'Learn more' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Button 1.1 URL' }), { target: { value: 'https://example.com/service' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save service' }));

    await waitFor(() => expect(adminApi.saveService).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Classic massage',
      telegramCaption: { text: 'Classic massage for relaxation', entities: [{ type: 'bold', offset: 0, length: 7 }, { type: 'text_link', offset: 0, length: 7, url: 'https://example.com/service' }] },
      telegramButtons: [[{ text: 'Learn more', url: 'https://example.com/service' }]],
    }), false));
  });

  it('uploads an image after creating a service', async () => {
    vi.mocked(adminApi.services).mockResolvedValue([]);
    vi.mocked(adminApi.saveService).mockImplementation(async (value) => value);
    vi.mocked(adminApi.uploadServicePhoto).mockResolvedValue({ ...service, photoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/photo?token=one' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Add service' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Service name' }), { target: { value: 'Massage 60 min' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description for assistant' }), { target: { value: 'Relaxing full-body massage.' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Duration (minutes)' }), { target: { value: '60' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Buffer (minutes)' }), { target: { value: '15' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Price' }), { target: { value: '1500' } });
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'massage.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Service photo'), { target: { files: [photo] } });
    fireEvent.click(screen.getByRole('button', { name: 'Save service' }));
    await waitFor(() => expect(adminApi.uploadServicePhoto).toHaveBeenCalledWith(expect.any(String), photo));
  });
});
