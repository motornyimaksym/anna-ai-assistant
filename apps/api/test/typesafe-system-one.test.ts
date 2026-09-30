import { afterEach, describe, expect, it, vi } from 'vitest';
import { TypeSafeSystemOneSelector } from '../src/typesafe-system-one.js';
import { safeErrorCategory } from '../src/debug-log.service.js';

const decision = { question: 'Does this message approve the exact proposal?', context: 'Yes, but change the time.' };
const choice = (value = 'booking', probabilities = { general: 0.1, booking: 0.9 }) => ({ type: 'choice', choice: value, confidence: 0.8, probabilities });
const repository = { getPromptOverride: vi.fn(async () => undefined as { prompt: string; updatedAt: string } | undefined) };
const setup = (answer: unknown) => {
  vi.stubEnv('TYPESAFE_AI_TOKEN', 'test-token');
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ model: 'jev-1.13.0', answers: { decision: answer }, usage: { input_tokens: 10, output_tokens: 3 } }) });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
};
const call = (_method = 'estimateProbability') => new TypeSafeSystemOneSelector(repository as never).estimateProbability(decision, AbortSignal.timeout(10_000));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); repository.getPromptOverride.mockReset().mockResolvedValue(undefined); });

describe('TypeSafe System One', () => {
  it.each([0, 0.37, 1])('returns Noul %s without rounding', async (noul) => {
    const fetcher = setup({ type: 'noul', noul });
    expect(await call('estimateProbability')).toBe(noul);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).questions.decision.type).toBe('noul');
  });
  it.each([-0.1, 1.1, '0.5', null, Infinity, NaN])('rejects invalid Noul %s', async (noul) => {
    setup({ type: 'noul', noul });
    await expect(call('estimateProbability')).rejects.toThrow();
  });
  it.each(['estimateProbability'] as const)('fails %s safely after retrying transient HTTP errors', async (method) => {
    const fetcher = setup(choice());
    fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ model: 'jev', answers: {} }) });
    await expect(call(method)).rejects.toThrow();
    fetcher.mockClear();
    const json = vi.fn(async () => ({ error: 'private provider details' }));
    fetcher.mockResolvedValue({ ok: false, status: 429, json });
    vi.useFakeTimers();
    const rejected = expect(call(method)).rejects.toThrow('TypeSafe HTTP 429');
    await vi.advanceTimersByTimeAsync(7000);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(json).not.toHaveBeenCalled();
    expect(safeErrorCategory(new Error('TypeSafe HTTP 429'))).toBe('TypeSafe HTTP 429');
  });
  it('rejects missing credentials and oversized context before network access', async () => {
    const fetcher = setup(choice());
    vi.stubEnv('TYPESAFE_AI_TOKEN', undefined);
    await expect(call('select')).rejects.toThrow('TypeSafe is not configured');
    vi.stubEnv('TYPESAFE_AI_TOKEN', 'test-token');
    const service = new TypeSafeSystemOneSelector(repository as never);

    await expect(service.estimateProbability({ ...decision, context: 'x'.repeat(100001) }, AbortSignal.timeout(1000))).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('propagates caller cancellation', async () => {
    setup(choice());
    const fetcher = vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const pending = new TypeSafeSystemOneSelector(repository as never).estimateProbability(decision, controller.signal);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    controller.abort(new DOMException('Cancelled', 'AbortError'));
    await expect(pending).rejects.toThrow('Cancelled');
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
  });
  it('uses a thirty-second provider deadline and propagates its timeout', async () => {
    setup(choice());
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const fetcher = vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetcher);
    try {
      const pending = new TypeSafeSystemOneSelector(repository as never).estimateProbability(decision, new AbortController().signal);
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
      expect(timeout).toHaveBeenCalledWith(30_000);
      deadline.abort(new DOMException('Deadline', 'TimeoutError'));
      await expect(pending).rejects.toThrow('Deadline');
    } finally { timeout.mockRestore(); }
  });
  it('propagates invalid JSON and network failures without fallback', async () => {
    const fetcher = setup(choice());
    fetcher.mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } });
    await expect(call('select')).rejects.toThrow('Invalid JSON');
    fetcher.mockRejectedValue(new TypeError('Network failure'));
    await expect(call('select')).rejects.toThrow('Network failure');
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
});

it('uses the same merged Handoff policy and returns a valid 100% score', async () => {
  repository.getPromptOverride.mockResolvedValueOnce({ prompt: 'Custom handoff guidance', updatedAt: new Date().toISOString() });
  const fetcher = setup({ type: 'noul', noul: 1 });
  expect(await call()).toBe(1);
  expect(repository.getPromptOverride).toHaveBeenCalledWith('handoff');
  const body = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(body.questions.decision.instructions).toContain('Custom handoff guidance');
  expect(body.questions.decision.instructions).toContain('look like a bot response');
  expect(body.state).toBe(decision.context);
  expect(body.questions.decision.type).toBe('noul');
});
