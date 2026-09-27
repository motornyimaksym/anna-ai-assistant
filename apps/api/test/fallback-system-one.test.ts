import { describe, expect, it, vi } from 'vitest';
import { FallbackSystemOneSelector } from '../src/fallback-system-one.js';
import { SystemOneSelector } from '../src/system-one.js';
import type { TypeSafeSystemOneSelector } from '../src/typesafe-system-one.js';
import type { OpenAiSystemOneSelector } from '../src/openai-system-one.js';
import { TypeSafeSystemOneSelector as TypeSafeAdapter } from '../src/typesafe-system-one.js';
import { OpenAiSystemOneSelector as OpenAiAdapter } from '../src/openai-system-one.js';

const routing = { message: 'Tomorrow?', summary: '', history: [], hasPendingProposal: false };
const decision = { question: 'Approve?', context: 'Yes' };
const setup = () => {
  const primary = { select: vi.fn().mockResolvedValue('booking'), answerBoolean: vi.fn().mockResolvedValue(true), estimateProbability: vi.fn().mockResolvedValue(0.8) };
  const backup = { select: vi.fn().mockResolvedValue('general'), answerBoolean: vi.fn().mockResolvedValue(false), estimateProbability: vi.fn().mockResolvedValue(0.2) };
  return { primary, backup, selector: new FallbackSystemOneSelector(primary as unknown as TypeSafeSystemOneSelector, backup as unknown as OpenAiSystemOneSelector) };
};

describe('System One provider fallback', () => {
  it('uses TypeSafe result without calling OpenAI', async () => {
    const { selector, backup } = setup();
    expect(await selector.select(routing, AbortSignal.timeout(1000))).toBe('booking');
    expect(backup.select).not.toHaveBeenCalled();
  });

  it.each(['select', 'answerBoolean', 'estimateProbability'] as const)('uses OpenAI for failed %s decision', async (method) => {
    const { selector, primary, backup } = setup();
    primary[method].mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    const input = method === 'select' ? routing : decision;
    const value = await (selector[method] as (input: typeof routing | typeof decision, signal: AbortSignal) => Promise<unknown>)(input, AbortSignal.timeout(1000));
    expect(value).toEqual({ select: 'general', answerBoolean: false, estimateProbability: 0.2 }[method]);
    expect(backup[method]).toHaveBeenCalledOnce();
    expect(backup[method].mock.calls[0]![0]).toEqual(input);
  });

  it('does not start fallback after caller cancellation', async () => {
    const { selector, primary, backup } = setup();
    const controller = new AbortController();
    primary.select.mockImplementationOnce(() => { controller.abort(); throw new Error('failed'); });
    await expect(selector.select(routing, controller.signal)).rejects.toThrow();
    expect(backup.select).not.toHaveBeenCalled();
  });

  it('fails closed when both providers fail', async () => {
    const { selector, primary, backup } = setup();
    primary.answerBoolean.mockRejectedValueOnce(new Error('TypeSafe unavailable'));
    backup.answerBoolean.mockRejectedValueOnce(new Error('OpenAI unavailable'));
    await expect(selector.answerBoolean(decision, AbortSignal.timeout(1000))).rejects.toThrow('OpenAI unavailable');
  });

  it('is bound as the production System One provider', async () => {
    const { AppModule } = await import('../src/app.module.js');
    expect(Reflect.getMetadata('providers', AppModule)).toContainEqual({ provide: SystemOneSelector, useClass: FallbackSystemOneSelector });
  });

  it('calls OpenAI Responses with the same routing input after TypeSafe HTTP failure', async () => {
    vi.stubEnv('TYPESAFE_AI_TOKEN', 'test-token');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const repository = { getRoutingPromptOverride: vi.fn(async () => undefined) };
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, headers: { get: () => null } })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"promptId":"general"}' }] }] }) });
    vi.stubGlobal('fetch', fetcher);
    try {
      const selector = new FallbackSystemOneSelector(new TypeSafeAdapter(repository as never), new OpenAiAdapter(repository as never));
      expect(await selector.select(routing, AbortSignal.timeout(25_000))).toBe('general');
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['https://api.typesafe.ai/v1/systemone', 'https://api.openai.com/v1/responses']);
      expect(JSON.parse(fetcher.mock.calls[1]![1].body).input).toEqual([{ role: 'user', content: JSON.stringify(routing) }]);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
