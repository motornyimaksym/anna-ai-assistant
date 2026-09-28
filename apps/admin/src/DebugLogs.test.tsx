// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DebugLogs } from './DebugLogs.js';
import { adminApi } from './api.js';
vi.mock('./api.js', () => ({ adminApi: { debugAccess: vi.fn(), debugLogs: vi.fn(), clearDebugLogs: vi.fn(), debugLogPayload: vi.fn(), promptTest: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DebugLogs uid="owner" /></QueryClientProvider>);
describe('debug page access', () => {
  it('never fetches logs for a denied account', async () => {
    vi.mocked(adminApi.debugAccess).mockResolvedValue({ canView: false }); show();
    expect(await screen.findByText('Debug tools are available only to the designated owner account.')).toBeTruthy();
    expect(adminApi.debugLogs).not.toHaveBeenCalled();
    expect(adminApi.clearDebugLogs).not.toHaveBeenCalled();
    expect(adminApi.promptTest).not.toHaveBeenCalled();
  });
  it('loads authorized diagnostic events and exposes refresh', async () => {
    vi.mocked(adminApi.debugAccess).mockResolvedValue({ canView: true });
    vi.mocked(adminApi.debugLogs).mockResolvedValue([{ id: '00000000-0000-4000-8000-000000000000', createdAt: '2026-09-27T00:00:00.000Z', traceId: '00000000-0000-4000-8000-000000000001', chatRef: 'anonymous', stage: 'booking_result', level: 'warn', details: { reason: 'calendar_unavailable', status: 'unavailable' } }]);
    show(); expect(await screen.findByText('booking_result')).toBeTruthy();
    expect(screen.getByText(/calendar_unavailable/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'System log' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Prompt test' })).toBeTruthy();
  });
  it('confirms before clearing retained logs, then reloads the empty log', async () => {
    const event = { id: '00000000-0000-4000-8000-000000000000', createdAt: '2026-09-27T00:00:00.000Z', traceId: '00000000-0000-4000-8000-000000000001', chatRef: 'anonymous', stage: 'booking_result' as const, level: 'warn' as const, details: { reason: 'calendar_unavailable' } };
    vi.mocked(adminApi.debugAccess).mockResolvedValue({ canView: true });
    vi.mocked(adminApi.debugLogs).mockResolvedValueOnce([event]).mockResolvedValueOnce([]);
    vi.mocked(adminApi.clearDebugLogs).mockResolvedValue({ ok: true });
    show();
    expect(await screen.findByText('booking_result')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(adminApi.clearDebugLogs).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Clear system log?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear log' }));
    await waitFor(() => expect(adminApi.clearDebugLogs).toHaveBeenCalledOnce());
    expect(await screen.findByText('No diagnostic events yet.')).toBeTruthy();
    expect(adminApi.debugLogs).toHaveBeenCalledTimes(2);
  });
  it('runs selected prompt with example text and shows its output', async () => {
    vi.mocked(adminApi.debugAccess).mockResolvedValue({ canView: true });
    vi.mocked(adminApi.debugLogs).mockResolvedValue([]);
    vi.mocked(adminApi.promptTest).mockResolvedValue({ kind: 'decision', output: 'booking', sampleContext: false });
    show();
    fireEvent.click(await screen.findByRole('tab', { name: 'Prompt test' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Example text' }), { target: { value: 'Can I book tomorrow?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run test' }));
    await waitFor(() => expect(vi.mocked(adminApi.promptTest).mock.calls[0]?.[0]).toEqual({ system: 'one', promptId: 'routing', text: 'Can I book tomorrow?' }));
    expect(await screen.findByText('booking')).toBeTruthy();
  });
  it('lets owner choose System Two planner and shows sample-context result', async () => {
    vi.mocked(adminApi.debugAccess).mockResolvedValue({ canView: true });
    vi.mocked(adminApi.debugLogs).mockResolvedValue([]);
    vi.mocked(adminApi.promptTest).mockResolvedValue({ kind: 'plan', output: '{"status":"needs_clarification"}', sampleContext: true });
    show();
    fireEvent.click(await screen.findByRole('tab', { name: 'Prompt test' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'System' }));
    fireEvent.click(await screen.findByRole('option', { name: 'System Two' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Prompt' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Booking planner' }));
    expect(screen.getByText(/sample schedule tomorrow/i)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Example text' }), { target: { value: 'Any time tomorrow?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run test' }));
    await waitFor(() => expect(vi.mocked(adminApi.promptTest).mock.calls[0]?.[0]).toEqual({ system: 'two', promptId: 'booking-planner', intent: 'availability', text: 'Any time tomorrow?' }));
    expect(await screen.findByText('Sample context used.')).toBeTruthy();
  });
});


it('shows existing request metadata and marks old truncated previews', async () => {
  vi.mocked(adminApi.debugAccess).mockResolvedValue({ canView: true });
  vi.mocked(adminApi.debugLogs).mockResolvedValue([{ id: '00000000-0000-4000-8000-000000000000', createdAt: '2026-09-27T00:00:00.000Z', traceId: '00000000-0000-4000-8000-000000000001', chatRef: 'anonymous', stage: 'provider_request', level: 'warn', details: { request: {
    provider: 'openai', operation: 's1_routing', endpoint: 'https://api.openai.com/v1/responses', method: 'POST', model: 'test-model', conversationAttached: false, store: false, maxOutputTokens: 4096, attempts: 1, durationMs: 250, responseStatus: 'incomplete', incompleteReason: 'max_output_tokens', outputTypes: ['reasoning'], requestBytes: 30000, responseBytes: 80, requestPreview: 'Request preview', responsePreview: 'Response preview', requestTruncated: true, responseTruncated: false,
  } } }]);
  show();
  expect(await screen.findByText('openai · s1_routing')).toBeTruthy();
  expect(screen.getByText(/Conversation: isolated/)).toBeTruthy();
  expect(screen.getByText('Request body')).toBeTruthy();
  expect(screen.getByText('Response body')).toBeTruthy();
  fireEvent.click(screen.getByText('Request body'));
  expect(screen.getByText('Legacy preview (truncated)')).toBeTruthy();
  expect(screen.getByText('Request preview')).toBeTruthy();
});

it('loads complete bodies only when expanded and displays them without truncation', async () => {
  vi.mocked(adminApi.debugAccess).mockResolvedValue({ canView: true });
  const id = '00000000-0000-4000-8000-000000000002';
  const requestBody = 'request '.repeat(3_000);
  vi.mocked(adminApi.debugLogs).mockResolvedValue([{ id, createdAt: '2026-09-27T00:00:00.000Z', traceId: '00000000-0000-4000-8000-000000000001', chatRef: 'anonymous', stage: 'provider_request', level: 'info', details: { request: {
    provider: 'openai', operation: 's1_routing', endpoint: 'https://api.openai.com/v1/responses', method: 'POST', model: 'test-model', conversationAttached: false, attempts: 1, durationMs: 10, outputTypes: [], requestBytes: requestBody.length, responseBytes: 20, bodyStorageStatus: 'complete',
  } } }]);
  vi.mocked(adminApi.debugLogPayload).mockResolvedValue({ status: 'complete', requestBody, responseBody: '{"status":"completed"}' });
  show();
  expect(await screen.findByText('openai · s1_routing')).toBeTruthy();
  expect(adminApi.debugLogPayload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Request body'));
  await waitFor(() => expect(adminApi.debugLogPayload).toHaveBeenCalledWith(id));
  await waitFor(() => expect([...document.querySelectorAll('pre')].some((element) => element.textContent === requestBody)).toBe(true));
  expect([...document.querySelectorAll('pre')].some((element) => element.textContent === requestBody)).toBe(true);
  expect(screen.getByText('Response body')).toBeTruthy();
});
