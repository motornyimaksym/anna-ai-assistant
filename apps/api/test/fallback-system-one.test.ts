import { describe, expect, it, vi } from 'vitest';
import { FallbackSystemOneSelector } from '../src/fallback-system-one.js';
import type { TypeSafeSystemOneSelector } from '../src/typesafe-system-one.js';
import type { OpenAiSystemOneSelector } from '../src/openai-system-one.js';
import { TypeSafeSystemOneSelector as TypeSafeAdapter } from '../src/typesafe-system-one.js';
import { OpenAiSystemOneSelector as OpenAiAdapter } from '../src/openai-system-one.js';


const decision = { question: 'Approve?', context: 'Yes' };
const setup = () => {
  const primary = { estimateProbability: vi.fn().mockResolvedValue(0.8) };
  const backup = { estimateProbability: vi.fn().mockResolvedValue(0.2) };
  return { primary, backup, selector: new FallbackSystemOneSelector(primary as unknown as TypeSafeSystemOneSelector, backup as unknown as OpenAiSystemOneSelector) };
};

describe('System One provider fallback', () => {
  it('uses TypeSafe result without calling OpenAI', async () => {
    const { selector, backup } = setup();
    expect(await selector.estimateProbability(decision, AbortSignal.timeout(1000))).toBe(0.8);
    expect(backup.estimateProbability).not.toHaveBeenCalled();
  });

  it.each(['estimateProbability'] as const)('uses OpenAI for failed %s decision', async (method) => {
    const { selector, primary, backup } = setup();
    primary[method].mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    const input = decision;
    const value = await (selector[method] as (input: typeof decision, signal: AbortSignal) => Promise<unknown>)(input, AbortSignal.timeout(1000));
    expect(value).toEqual({ select: 'general', answerBoolean: false, estimateProbability: 0.2 }[method]);
    expect(backup[method]).toHaveBeenCalledOnce();
    expect(backup[method].mock.calls[0]![0]).toEqual(input);
  });

  it('allows 30 seconds for TypeSafe and OpenAI fallback decisions', async () => {
    const { selector, primary } = setup();
    primary.estimateProbability.mockRejectedValueOnce(new Error('TypeSafe unavailable'));
    const callerSignal = AbortSignal.timeout(45_000);
    const timeout = vi.spyOn(AbortSignal, 'timeout');

    await selector.estimateProbability(decision, callerSignal);

    expect(timeout.mock.calls).toEqual([[30_000], [30_000]]);
  });

  it('does not start fallback after caller cancellation', async () => {
    const { selector, primary, backup } = setup();
    const controller = new AbortController();
    primary.estimateProbability.mockImplementationOnce(() => { controller.abort(); throw new Error('failed'); });
    await expect(selector.estimateProbability(decision, controller.signal)).rejects.toThrow();
    expect(backup.estimateProbability).not.toHaveBeenCalled();
  });

  it('fails closed when both providers fail', async () => {
    const { selector, primary, backup } = setup();
    primary.estimateProbability.mockRejectedValueOnce(new Error('TypeSafe unavailable'));
    backup.estimateProbability.mockRejectedValueOnce(new Error('OpenAI unavailable'));
    await expect(selector.estimateProbability(decision, AbortSignal.timeout(1000))).rejects.toThrow('OpenAI unavailable');
  });

  it('calls OpenAI Responses with the same handoff input after TypeSafe HTTP failure', async () => {
    vi.stubEnv('TYPESAFE_AI_TOKEN', 'test-token');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const repository = { getPromptOverride: vi.fn(async () => undefined) };
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, headers: { get: () => null } })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"probability":0.2}' }] }] }) });
    vi.stubGlobal('fetch', fetcher);
    try {
      const selector = new FallbackSystemOneSelector(new TypeSafeAdapter(repository as never), new OpenAiAdapter(repository as never));
      expect(await selector.estimateProbability(decision, AbortSignal.timeout(25_000))).toBe(0.2);
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['https://api.typesafe.ai/v1/systemone', 'https://api.openai.com/v1/responses']);
      expect(JSON.parse(fetcher.mock.calls[1]![1].body).input).toEqual([{ role: 'user', content: JSON.stringify(decision) }]);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
