import { afterEach, describe, expect, it, vi } from 'vitest';
import { TypeSafeSystemOneSelector } from '../src/typesafe-system-one.js';
import { SYSTEM_TWO_PROMPTS } from '../src/system-two.js';
import { safeErrorCategory } from '../src/debug-log.service.js';
import { APPROVAL_QUESTION } from '../src/confirmation-prompt.js';

const routing = { message: 'Tomorrow?', summary: 'Choosing massage', history: [{ role: 'assistant' as const, content: 'Which day?' }], hasPendingProposal: true };
const decision = { question: 'Does this message approve the exact proposal?', context: 'Yes, but change the time.' };
const choice = (value = 'booking', probabilities = { general: 0.1, booking: 0.9 }) => ({ type: 'choice', choice: value, confidence: 0.8, probabilities });
const repository = { getPromptOverride: vi.fn(async () => undefined as { prompt: string; updatedAt: string } | undefined), getRoutingPromptOverride: vi.fn(async () => undefined as { instructions: string; general?: string; booking?: string; updatedAt: string } | undefined) };
const setup = (answer: unknown) => {
  vi.stubEnv('TYPESAFE_AI_TOKEN', 'test-token');
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ model: 'jev-1.13.0', answers: { decision: answer }, usage: { input_tokens: 10, output_tokens: 3 } }) });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
};
const call = (method: 'select' | 'answerBoolean' | 'estimateProbability') => {
  const service = new TypeSafeSystemOneSelector(repository as never);
  return method === 'select' ? service.select(routing, AbortSignal.timeout(10_000)) : service[method](decision, AbortSignal.timeout(10_000));
};
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); repository.getPromptOverride.mockReset().mockResolvedValue(undefined); repository.getRoutingPromptOverride.mockReset().mockResolvedValue(undefined); });

describe('TypeSafe System One', () => {
  it('uses saved instructions for routing, approval, and probability', async () => {
    const scenarios = [
      { id: 'routing', answer: choice(), run: (service: TypeSafeSystemOneSelector) => service.select(routing, AbortSignal.timeout(1000)) },
      { id: 'approval', answer: { type: 'choice', choice: 'yes', confidence: 1, probabilities: { yes: 1, no: 0 } }, run: (service: TypeSafeSystemOneSelector) => service.answerBoolean({ ...decision, question: APPROVAL_QUESTION }, AbortSignal.timeout(1000)) },
      { id: 'probability', answer: { type: 'noul', noul: 0.5 }, run: (service: TypeSafeSystemOneSelector) => service.estimateProbability(decision, AbortSignal.timeout(1000)) },
    ];
    for (const { id, answer, run } of scenarios) {
      if (id === 'routing') repository.getRoutingPromptOverride.mockResolvedValueOnce({ instructions: `Custom ${id}`, general: 'General custom', booking: 'Booking custom', updatedAt: new Date().toISOString() });
      else repository.getPromptOverride.mockResolvedValueOnce({ prompt: `Custom ${id}`, updatedAt: new Date().toISOString() });
      const fetcher = setup(answer);
      await run(new TypeSafeSystemOneSelector(repository as never));
      if (id === 'routing') {
        expect(repository.getRoutingPromptOverride).toHaveBeenCalledOnce();
        expect(JSON.parse(fetcher.mock.calls[0]![1].body).questions.decision.criteria).toEqual({ general: 'General custom', booking: 'Booking custom' });
      } else expect(repository.getPromptOverride).toHaveBeenLastCalledWith(id);
      const instructions = JSON.parse(fetcher.mock.calls[0]![1].body).questions.decision.instructions as string;
      expect(instructions).toContain(`Custom ${id}`);
      if (id === 'approval') expect(instructions).toContain(APPROVAL_QUESTION);
    }
  });
  it.each(['general', 'booking'])('selects %s using registry criteria and bounded context', async (selected) => {
    const fetcher = setup(choice(selected, selected === 'general' ? { general: 0.9, booking: 0.1 } : { general: 0.1, booking: 0.9 }));
    expect(await call('select')).toBe(selected);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(init.redirect).toBe('error');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('jev-latest');
    expect(body.state).toEqual(routing);
    expect(body.questions.decision.criteria).toEqual(Object.fromEntries(Object.entries(SYSTEM_TWO_PROMPTS).map(([id, value]) => [id, value.description])));
    expect(body.questions.decision.instructions).toContain('untrusted');
    expect(body.tools).toBeUndefined();
    expect(init.body).not.toContain('test-token');
  });
  it.each(['yes', 'no'])('maps boolean choice %s explicitly', async (selected) => {
    const fetcher = setup({ type: 'choice', choice: selected, probabilities: { yes: selected === 'yes' ? 1 : 0, no: selected === 'no' ? 1 : 0 }, confidence: 1 });
    expect(await call('answerBoolean')).toBe(selected === 'yes');
    const body = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(body.state).toBe(decision.context);
    expect(body.questions.decision.instructions).toContain(decision.question);
    expect(body.questions.decision.criteria.no).toContain('ambiguous');
  });
  it.each([0, 0.37, 1])('returns Noul %s without rounding', async (noul) => {
    const fetcher = setup({ type: 'noul', noul });
    expect(await call('estimateProbability')).toBe(noul);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).questions.decision.type).toBe('noul');
  });
  it.each([
    choice('unknown'), { ...choice(), type: 'score' }, { ...choice(), confidence: 2 },
    { ...choice(), probabilities: { general: 0.1 } },
    { ...choice(), probabilities: { general: 0.1, booking: 0.9, extra: 0 } },
    { ...choice(), probabilities: { general: 0.9, booking: 0.9 } },
    { ...choice(), probabilities: { general: -0.1, booking: 1.1 } },
    choice('general'), { ...choice(), probabilities: { general: '0.1', booking: 0.9 } },
    null,
  ])('rejects malformed routing metadata %#', async (answer) => {
    setup(answer);
    await expect(call('select')).rejects.toThrow();
  });
  it.each([-0.1, 1.1, '0.5', null, Infinity, NaN])('rejects invalid Noul %s', async (noul) => {
    setup({ type: 'noul', noul });
    await expect(call('estimateProbability')).rejects.toThrow();
  });
  it('rejects a probability instead of a boolean choice', async () => {
    setup({ type: 'noul', noul: 1 });
    await expect(call('answerBoolean')).rejects.toThrow();
  });
  it.each(['select', 'answerBoolean', 'estimateProbability'] as const)('fails %s safely after retrying transient HTTP errors', async (method) => {
    const fetcher = setup(choice());
    fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ model: 'jev', answers: {} }) });
    await expect(call(method)).rejects.toThrow();
    fetcher.mockClear();
    const json = vi.fn(async () => ({ error: 'private provider details' }));
    fetcher.mockResolvedValue({ ok: false, status: 429, json });
    await expect(call(method)).rejects.toThrow('TypeSafe HTTP 429');
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
    await expect(service.select({ ...routing, message: 'x'.repeat(4001) }, AbortSignal.timeout(1000))).rejects.toThrow();
    await expect(service.answerBoolean({ ...decision, context: 'x'.repeat(100001) }, AbortSignal.timeout(1000))).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('propagates caller cancellation', async () => {
    setup(choice());
    const fetcher = vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const pending = new TypeSafeSystemOneSelector(repository as never).select(routing, controller.signal);
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
      const pending = new TypeSafeSystemOneSelector(repository as never).select(routing, new AbortController().signal);
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
