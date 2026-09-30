import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithLinearBackoff } from '../src/index.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchWithLinearBackoff', () => {
  it('retries replay-safe transient statuses with linear delays', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = fetchWithLinearBackoff('https://example.test/read', {}, { replaySafe: true });
    await vi.advanceTimersByTimeAsync(249);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);

    expect((await result).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries replay-safe network failures', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = fetchWithLinearBackoff('https://example.test/read', {}, { replaySafe: true });
    await vi.runAllTimersAsync();
    expect((await result).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not replay unsafe writes after timeout, reset, or 5xx', async () => {
    const reset = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('socket reset'), { code: 'ECONNRESET' }) });
    const fetchMock = vi.fn().mockRejectedValueOnce(reset);
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchWithLinearBackoff('https://example.test/write', { method: 'POST', body: '{}' })).rejects.toBe(reset);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset().mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    await expect(fetchWithLinearBackoff('https://example.test/write', { method: 'POST', body: '{}' })).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset().mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(fetchWithLinearBackoff('https://example.test/write', { method: 'POST', body: '{}' })).resolves.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries unsafe writes after HTTP 429 and proven pre-send connection failure', async () => {
    vi.useFakeTimers();
    const refused = Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { cause: refused }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = fetchWithLinearBackoff('https://example.test/write', { method: 'POST', body: '{}' });
    await vi.runAllTimersAsync();
    expect((await result).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never retries permanent client errors and stops when caller cancels during backoff', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchWithLinearBackoff('https://example.test/read')).resolves.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    fetchMock.mockReset().mockResolvedValueOnce(new Response(null, { status: 503 }));
    const controller = new AbortController();
    const request = fetchWithLinearBackoff('https://example.test/read', { signal: controller.signal });
    controller.abort(new DOMException('Caller stopped', 'AbortError'));
    await expect(request).rejects.toMatchObject({ name: 'AbortError', message: 'Caller stopped' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});


it('reports attempts without allowing observer failures to change delivery', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(new Response('ok'));
  vi.stubGlobal('fetch', fetcher);
  const onAttempt = vi.fn(() => { throw new Error('diagnostic unavailable'); });
  const response = await fetchWithLinearBackoff('https://example.test', {}, { baseDelayMs: 0, onAttempt });
  expect(await response.text()).toBe('ok');
  expect(onAttempt.mock.calls).toEqual([[1], [2]]);
});

it.each([
  [{ 'Retry-After': '10.131' }, 10131],
  [{ 'retry-after-ms': '2300' }, 2300],
  [{ 'Retry-After': 'Wed, 30 Sep 2026 14:00:12 GMT' }, 12000],
  [{ 'x-ratelimit-reset-tokens': '1s500ms' }, 1500],
  [{ 'x-ratelimit-reset-tokens': '2s', 'x-ratelimit-remaining-requests': '0', 'x-ratelimit-reset-requests': '3s' }, 3000],
  [{ 'Retry-After': 'invalid' }, 1000],
  [{ 'Retry-After': '-1' }, 1000],
])('waits for structured rate-limit hints %j', async (headers, delay) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-30T14:00:00Z'));
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429, headers: headers as Record<string, string> })).mockResolvedValueOnce(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  const pending = fetchWithLinearBackoff('https://example.test', {}, { rateLimitResetHeaders: true });
  await vi.advanceTimersByTimeAsync(delay - 1);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect((await pending).status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('aborts during provider backoff without issuing another request', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '20' } }));
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  const pending = fetchWithLinearBackoff('https://example.test', { signal: controller.signal });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
  await vi.advanceTimersByTimeAsync(5000);
  controller.abort(new DOMException('Deadline', 'TimeoutError'));
  await rejected;
  await vi.advanceTimersByTimeAsync(20000);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('returns a rejection instead of shortening an excessive wait', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '999999999' } }));
  vi.stubGlobal('fetch', fetcher);
  expect((await fetchWithLinearBackoff('https://example.test')).status).toBe(429);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('caps 429 retries and preserves request identity', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockImplementation(async () => new Response(null, { status: 429 }));
  vi.stubGlobal('fetch', fetcher);
  const pending = fetchWithLinearBackoff('https://example.test', { method: 'POST', headers: { 'Idempotency-Key': 'same-key' }, body: '{}' });
  await vi.advanceTimersByTimeAsync(6999);
  expect(fetcher).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(1);
  expect((await pending).status).toBe(429);
  expect(fetcher).toHaveBeenCalledTimes(4);
  for (const call of fetcher.mock.calls) expect(call[1]).toMatchObject({ headers: { 'Idempotency-Key': 'same-key' }, body: '{}' });
});
