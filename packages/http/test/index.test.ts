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
    await vi.advanceTimersByTimeAsync(500);

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
