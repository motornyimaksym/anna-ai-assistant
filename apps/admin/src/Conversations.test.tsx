// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Conversations } from './Conversations.js';
import { adminApi } from './api.js';

vi.mock('./api.js', () => ({ adminApi: { conversations: vi.fn(), humanRequests: vi.fn(), clearConversationContext: vi.fn(), releaseHumanRequest: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('clears context beside request release and reports removed message count', async () => {
  vi.mocked(adminApi.conversations).mockResolvedValue([{ telegramChatId: 'chat-1', assistantEnabled: true, state: 'active', summary: '', createdAt: '2026-09-28T10:00:00.000Z', updatedAt: '2026-09-28T10:00:00.000Z' }]);
  vi.mocked(adminApi.humanRequests).mockResolvedValue([{ id: 'case-1', conversationId: 'chat-1', telegramChatId: 'chat-1', telegramUpdateId: 1, status: 'open', reason: 'operation_error', thresholdPercent: 60, question: 'Need help', queuedMessages: [], notifications: {}, createdAt: '2026-09-28T10:00:00.000Z', updatedAt: '2026-09-28T10:00:00.000Z' }]);
  vi.mocked(adminApi.clearConversationContext).mockResolvedValue({ clearedMessages: 2 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><Conversations /></QueryClientProvider>);

  expect(await screen.findByText('Request case-1 · open')).toBeTruthy();
  const buttons = screen.getAllByRole('button', { name: 'Clear context' });
  fireEvent.click(buttons[0]!);
  await waitFor(() => expect(adminApi.clearConversationContext).toHaveBeenCalledWith('chat-1'));
  expect(await screen.findByText('Context cleared. 2 messages removed.')).toBeTruthy();
  expect(adminApi.releaseHumanRequest).not.toHaveBeenCalled();
});
