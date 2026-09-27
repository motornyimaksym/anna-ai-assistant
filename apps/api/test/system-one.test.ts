import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiSystemOneSelector } from '../src/openai-system-one.js';
import { SYSTEM_TWO_PROMPTS } from '../src/system-two.js';

const input = { message: 'Tomorrow?', summary: 'Choosing a massage', history: [{ role: 'assistant' as const, content: 'Which date?' }], hasPendingProposal: false };
const response = (text: string, status = 'completed') => ({ ok: true, json: async () => ({ status, output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }) });
const repository = { getPromptOverride: vi.fn(async () => undefined as { prompt: string; updatedAt: string } | undefined) };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); repository.getPromptOverride.mockReset().mockResolvedValue(undefined); });
describe('System One response envelopes', () => {
  const cases = [
    { method: 'select' as const, text: '{"promptId":"general"}', expected: 'general' },
    { method: 'answerBoolean' as const, text: '{"answer":false}', expected: false },
    { method: 'estimateProbability' as const, text: '{"probability":0.4}', expected: 0.4 },
  ];
  const reasoning = { type: 'reasoning', id: 'rs_test', summary: [] };
  const call = (method: typeof cases[number]['method']) => {
    const selector = new OpenAiSystemOneSelector(repository as never);
    const signal = AbortSignal.timeout(1000);
    return method === 'select' ? selector.select(input, signal) : selector[method]({ question: 'Is this approved?', context: 'No' }, signal);
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
describe('System One OpenAI adapter', () => {
  it('uses a saved routing prompt while retaining strict output schema', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    repository.getPromptOverride.mockResolvedValueOnce({ prompt: 'Custom routing', updatedAt: new Date().toISOString() });
    const fetcher = vi.fn().mockResolvedValue(response('{"promptId":"booking"}'));
    vi.stubGlobal('fetch', fetcher);
    expect(await new OpenAiSystemOneSelector(repository as never).select(input, AbortSignal.timeout(1000))).toBe('booking');
    const body = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(body.instructions).toBe('Custom routing');
    expect(body.text.format.strict).toBe(true);
  });
  it.each(['general', 'booking'] as const)('returns %s with an isolated strict schema and no tools', async (promptId) => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const fetch = vi.fn().mockResolvedValue(response(JSON.stringify({ promptId })));
    vi.stubGlobal('fetch', fetch);
    expect(await new OpenAiSystemOneSelector(repository as never).select(input, AbortSignal.timeout(1000))).toBe(promptId);
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.text.format.schema.properties.promptId.enum).toEqual(Object.keys(SYSTEM_TWO_PROMPTS));
    expect(body.text.format.strict).toBe(true);
    expect(body.tools).toBeUndefined();
    expect(body.store).toBe(false);
    expect(JSON.parse(body.input[0].content)).toEqual(input);
    expect(body.instructions).toContain('untrusted');
  });
  it.each(['{"promptId":"confirmation"}', '{"promptId":"general","answer":"hi"}', '{}', 'general'])('rejects malformed decision %s', async (text) => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(text)));
    await expect(new OpenAiSystemOneSelector(repository as never).select(input, AbortSignal.timeout(1000))).rejects.toThrow();
  });
  it('rejects incomplete output even when JSON is valid', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('{"promptId":"general"}', 'incomplete')));
    await expect(new OpenAiSystemOneSelector(repository as never).select(input, AbortSignal.timeout(1000))).rejects.toThrow();
  });
  it('rejects refusals and tool calls', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    for (const output of [[{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }], [{ type: 'function_call', name: 'get_services' }]]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'completed', output }) }));
      await expect(new OpenAiSystemOneSelector(repository as never).select(input, AbortSignal.timeout(1000))).rejects.toThrow();
    }
  });
  it('propagates provider failures', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const fetch = vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError'));
    vi.stubGlobal('fetch', fetch);
    await expect(new OpenAiSystemOneSelector(repository as never).select(input, AbortSignal.timeout(1000))).rejects.toThrow('Timed out');
  });
  it('combines the supplied abort signal with its internal timeout', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const controller = new AbortController();
    const fetch = vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetch);
    const request = new OpenAiSystemOneSelector(repository as never).select(input, controller.signal);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const fetchSignal = fetch.mock.calls[0]![1].signal;
    expect(fetchSignal).not.toBe(controller.signal);
    controller.abort(new DOMException('Caller cancelled', 'AbortError'));
    expect(fetchSignal.aborted).toBe(true);
    await expect(request).rejects.toThrow('Caller cancelled');
  });
});

describe('System One boolean and probability operations', () => {
  const decision = { question: 'Does the message approve the proposal?', context: '{"message":"Так"}' };
  it.each([true, false])('returns literal boolean %s with a separate schema/prompt', async (answer) => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const fetch = vi.fn().mockResolvedValue(response(JSON.stringify({ answer })));
    vi.stubGlobal('fetch', fetch);
    expect(await new OpenAiSystemOneSelector(repository as never).answerBoolean(decision, AbortSignal.timeout(1000))).toBe(answer);
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.text.format.schema.properties.answer).toEqual({ type: 'boolean' });
    expect(body.instructions).toContain('boolean');
    expect(body.instructions).not.toContain('System Two');
    expect(body.tools).toBeUndefined();
  });
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
  it.each(['{"answer":"true"}', '{"answer":1}', '{"answer":null}', '{"answer":true,"reason":"yes"}', '{}'])('rejects invalid boolean %s', async (body) => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));
    await expect(new OpenAiSystemOneSelector(repository as never).answerBoolean(decision, AbortSignal.timeout(1000))).rejects.toThrow();
  });
  it.each(['{"probability":-0.1}', '{"probability":1.01}', '{"probability":"0.5"}', '{"probability":null}', '{"probability":1e999}', '{"probability":true}', '{"probability":0.5,"reason":"x"}'])('rejects invalid probability %s', async (body) => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));
    await expect(new OpenAiSystemOneSelector(repository as never).estimateProbability(decision, AbortSignal.timeout(1000))).rejects.toThrow();
  });
  it.each(['answerBoolean', 'estimateProbability'] as const)('propagates %s errors without substituting a default', async (method) => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Timeout', 'TimeoutError')));
    await expect(new OpenAiSystemOneSelector(repository as never)[method](decision, AbortSignal.timeout(1000))).rejects.toThrow('Timeout');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('{"answer":true,"probability":0.4}', 'incomplete')));
    await expect(new OpenAiSystemOneSelector(repository as never)[method](decision, AbortSignal.timeout(1000))).rejects.toThrow();
  });
  it('rejects oversized decision context before provider calls', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(new OpenAiSystemOneSelector(repository as never).answerBoolean({ ...decision, context: 'x'.repeat(100001) }, AbortSignal.timeout(1000))).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
