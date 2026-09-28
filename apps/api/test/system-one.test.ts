import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiSystemOneSelector } from '../src/openai-system-one.js';

const response = (text: string, status = 'completed') => ({ ok: true, json: async () => ({ status, output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }) });
const repository = { getPromptOverride: vi.fn(async () => undefined as { prompt: string; updatedAt: string } | undefined) };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); repository.getPromptOverride.mockReset().mockResolvedValue(undefined); });
describe('System One response envelopes', () => {
  const cases = [
    { method: 'estimateProbability' as const, text: '{"probability":0.4}', expected: 0.4 },
  ];
  const reasoning = { type: 'reasoning', id: 'rs_test', summary: [] };
  const call = (method: typeof cases[number]['method']) => {
    const selector = new OpenAiSystemOneSelector(repository as never);
    const signal = AbortSignal.timeout(1000);
    return selector[method]({ question: 'Is this approved?', context: 'No' }, signal);
  };
  it.each(cases)('accepts reasoning metadata with a valid $method decision', async ({ method, text, expected }) => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const message = { type: 'message', content: [{ type: 'output_text', text }] };
    for (const output of [[reasoning, message], [message, reasoning]]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'completed', output }) }));
      expect(await call(method)).toBe(expected);
    }
  });
  it.each(cases)('rejects invalid envelopes even alongside a valid $method decision', async ({ method, text }) => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const message = { type: 'message', content: [{ type: 'output_text', text }] };
    const invalid = [
      [], [reasoning], [reasoning, message, message],
      [reasoning, message, { type: 'function_call', name: 'create_booking' }],
      [reasoning, message, { type: 'unknown' }],
      [reasoning, { type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }],
      [reasoning, { type: 'message', content: [] }],
      [reasoning, { type: 'message', content: [...message.content, ...message.content] }],
      [reasoning, { type: 'message', content: [{ type: 'output_text', text: 'invalid JSON' }] }],
    ];
    for (const output of invalid) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'completed', output }) }));
      await expect(call(method)).rejects.toThrow();
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'incomplete', output: [reasoning, message] }) }));
    await expect(call(method)).rejects.toThrow();
  });
});
describe('System One handoff probability', () => {
  const decision = { question: 'Does the message approve the proposal?', context: '{"message":"Так"}' };
  it.each([0, 0.4, 1])('returns bounded probability %s without rounding', async (probability) => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const fetch = vi.fn().mockResolvedValue(response(JSON.stringify({ probability })));
    vi.stubGlobal('fetch', fetch);
    expect(await new OpenAiSystemOneSelector(repository as never).estimateProbability(decision, AbortSignal.timeout(1000))).toBe(probability);
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.text.format.schema.properties.probability).toEqual({ type: 'number', minimum: 0, maximum: 1 });
    expect(body.instructions).toContain('probability');
    expect(body.tools).toBeUndefined();
  });
  it.each(['{"probability":-0.1}', '{"probability":1.01}', '{"probability":"0.5"}', '{"probability":null}', '{"probability":1e999}', '{"probability":true}', '{"probability":0.5,"reason":"x"}'])('rejects invalid probability %s', async (body) => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));
    await expect(new OpenAiSystemOneSelector(repository as never).estimateProbability(decision, AbortSignal.timeout(1000))).rejects.toThrow();
  });
  it.each(['estimateProbability'] as const)('propagates %s errors without substituting a default', async (method) => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Timeout', 'TimeoutError')));
    await expect(new OpenAiSystemOneSelector(repository as never)[method](decision, AbortSignal.timeout(1000))).rejects.toThrow(/timeout/i);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('{"answer":true,"probability":0.4}', 'incomplete')));
    await expect(new OpenAiSystemOneSelector(repository as never)[method](decision, AbortSignal.timeout(1000))).rejects.toThrow();
  });
  it('rejects oversized decision context before provider calls', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(new OpenAiSystemOneSelector(repository as never).estimateProbability({ ...decision, context: 'x'.repeat(100001) }, AbortSignal.timeout(1000))).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});


describe('System One output budget', () => {
  const cases = [
    { method: 'estimateProbability' as const, text: '{"probability":0.4}', expected: 0.4 },
  ];
  const incomplete = (reason = 'max_output_tokens') => ({ ok: true, json: async () => ({ status: 'incomplete', incomplete_details: { reason }, output: [] }) });
  const call = (method: typeof cases[number]['method'], signal = AbortSignal.timeout(1000)) => {
    const selector = new OpenAiSystemOneSelector(repository as never);
    return selector[method]({ question: 'Decision?', context: 'Evidence' }, signal);
  };
  it.each(cases)('retries only token exhaustion for $method with the same decision and deadline', async ({ method, text, expected }) => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetcher = vi.fn().mockResolvedValueOnce(incomplete()).mockResolvedValueOnce(response(text));
    vi.stubGlobal('fetch', fetcher);
    expect(await call(method)).toBe(expected);
    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(timeout.mock.calls.filter(([milliseconds]) => milliseconds === 10_000)).toHaveLength(1);
    expect(bodies[0].max_output_tokens).toBe(4096);
    expect(bodies[1]).toEqual({ ...bodies[0], max_output_tokens: 8192 });
    expect(bodies[1].store).toBe(false);
    expect(bodies[1].tools).toBeUndefined();
    expect(bodies[1].conversation).toBeUndefined();
  });
  it.each(cases)('stops after one exhausted retry for $method', async ({ method }) => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const fetcher = vi.fn().mockResolvedValue(incomplete());
    vi.stubGlobal('fetch', fetcher);
    await expect(call(method)).rejects.toMatchObject({ code: 'OPENAI_DECISION_TOKEN_LIMIT' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not retry other incomplete reasons or accept partial JSON', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const fetcher = vi.fn().mockResolvedValue(incomplete('content_filter'));
    vi.stubGlobal('fetch', fetcher);
    await expect(call('estimateProbability')).rejects.toMatchObject({ code: 'OPENAI_DECISION_INCOMPLETE' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockClear().mockResolvedValue(response('{"promptId":"general"}', 'incomplete'));
    await expect(call('estimateProbability')).rejects.toMatchObject({ code: 'OPENAI_DECISION_INCOMPLETE' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not retry after caller cancellation', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const controller = new AbortController();
    const fetcher = vi.fn(async () => { controller.abort(); return incomplete(); });
    vi.stubGlobal('fetch', fetcher);
    await expect(call('estimateProbability', controller.signal)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

it('uses merged editable Handoff instructions with mandatory exact-100% confirmation rule', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'test');
  repository.getPromptOverride.mockResolvedValueOnce({ prompt: 'Custom handoff guidance', updatedAt: new Date().toISOString() });
  const fetcher = vi.fn().mockResolvedValue(response('{"probability":1}'));
  vi.stubGlobal('fetch', fetcher);
  expect(await new OpenAiSystemOneSelector(repository as never).estimateProbability({ question: 'Handoff?', context: 'Confirmed' }, AbortSignal.timeout(1000))).toBe(1);
  expect(repository.getPromptOverride).toHaveBeenCalledWith('handoff');
  const body = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(body.instructions).toContain('Custom handoff guidance');
  expect(body.instructions).toContain('exactly 1 (100%)');
  expect(body.instructions).toContain('knowledge base');
  expect(body.instructions).toContain('automated bot response');
  expect(body.store).toBe(false);
  expect(body.tools).toBeUndefined();
});
