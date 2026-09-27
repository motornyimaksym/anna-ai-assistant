import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAiConversation, requestOpenAiResponse } from '../src/openai-transport.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('OpenAI HTTP transport retries', () => {
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
