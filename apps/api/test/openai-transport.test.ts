import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAiConversation, requestOpenAiResponse } from '../src/openai-transport.js';
import { safeErrorDiagnostic, safeErrorCategory } from '../src/debug-log.service.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('OpenAI HTTP transport retries', () => {
  it.each(['conversation', 'response'])('captures sanitized %s provider errors without leaking content', async (kind) => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-secret123456789012');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
      code: 'invalid_request_error', param: 'input[0].content',
      message: 'Invalid value "private text": sk-secret123456789012 alice@example.com conv_private123 client private message',
    } }), { status: 400, headers: { 'x-request-id': 'req_example' } })));
    const result = kind === 'conversation' ? createOpenAiConversation(new AbortController().signal)
      : requestOpenAiResponse({ input: 'client private message' }, new AbortController().signal);
    const error = await result.catch((value: unknown) => value);
    expect(safeErrorCategory(error)).toBe('provider HTTP 400');
    const diagnostic = safeErrorDiagnostic(error);
    expect(diagnostic).toMatchObject({ upstreamStatus: 400, providerRequestId: 'req_example', providerError: { code: 'invalid_request_error', param: 'input[0].content' } });
    expect(JSON.stringify(diagnostic)).not.toMatch(/sk-secret|alice@example|conv_private|private text/);
    if (kind === 'response') expect(JSON.stringify(diagnostic)).not.toContain('client private message');
  });
  it.each(['not json', 'x'.repeat(16_385), '{}'])('preserves HTTP failure when provider body is unusable %#', async (body) => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 400 })));
    const error = await requestOpenAiResponse({}, new AbortController().signal).catch((value: unknown) => value);
    expect(safeErrorCategory(error)).toBe('provider HTTP 400');
    expect(safeErrorDiagnostic(error).providerError).toBeUndefined();
  });
  it.each([
    ['conversation creation', 'conversation'] as const,
    ['Responses request', 'response'] as const,
  ])('retries a transient failure for %s with the same idempotency key', async (_label, kind) => {
    vi.useFakeTimers();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(kind === 'conversation'
        ? new Response(JSON.stringify({ id: 'conv_123' }), { status: 200 })
        : new Response(JSON.stringify({ id: 'resp_123' }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    const result = kind === 'conversation'
      ? createOpenAiConversation(signal)
      : requestOpenAiResponse({ conversation: 'conv_123', input: [{ role: 'user', content: 'Hi' }] }, signal);

    await vi.advanceTimersByTimeAsync(250);
    if (kind === 'conversation') await expect(result).resolves.toBe('conv_123');
    else await expect(result).resolves.toMatchObject({ id: 'resp_123' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const firstHeaders = fetcher.mock.calls[0]![1]!.headers as Record<string, string>;
    const secondHeaders = fetcher.mock.calls[1]![1]!.headers as Record<string, string>;
    expect(firstHeaders['Idempotency-Key']).toBeTruthy();
    expect(secondHeaders['Idempotency-Key']).toBe(firstHeaders['Idempotency-Key']);
  });
});
