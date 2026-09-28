import { describe, expect, it, vi } from 'vitest';
import { ConfigurableSystemOneSelector } from '../src/configurable-system-one.js';
import { SystemOneSelector } from '../src/system-one.js';
import { systemOneSettingsSchema } from '@booking/contracts';
const decision = { question: 'Approve?', context: 'Так підходить' };
const adapter = () => ({ estimateProbability: vi.fn(async () => 0.9) });

describe('configured System One provider', () => {
  it.each(['estimateProbability'] as const)('uses OpenAI by default for %s and switches on the next decision', async (method) => {
    const repository = { getSystemOneSettings: vi.fn().mockResolvedValue({ provider: 'openai' }) };
    const openai = adapter(); const typesafe = adapter();
    const selector = new ConfigurableSystemOneSelector(repository as never, openai as never, typesafe as never);
    const run = () => selector[method](decision, AbortSignal.timeout(1000));
    await run(); expect(openai[method]).toHaveBeenCalledOnce(); expect(typesafe[method]).not.toHaveBeenCalled();
    repository.getSystemOneSettings.mockResolvedValue({ provider: 'typesafe' });
    await run(); expect(typesafe[method]).toHaveBeenCalledOnce(); expect(repository.getSystemOneSettings).toHaveBeenCalledTimes(2);
  });
  it('never calls TypeSafe after an OpenAI failure or negative approval', async () => {
    const openai = adapter(); const typesafe = adapter();
    const selector = new ConfigurableSystemOneSelector({ getSystemOneSettings: vi.fn(async () => ({ provider: 'openai' })) } as never, openai as never, typesafe as never);
    openai.estimateProbability.mockResolvedValueOnce(0).mockRejectedValueOnce(new Error('unavailable'));
    expect(await selector.estimateProbability(decision, AbortSignal.timeout(1000))).toBe(0);
    await expect(selector.estimateProbability(decision, AbortSignal.timeout(1000))).rejects.toThrow('unavailable');
    expect(typesafe.estimateProbability).not.toHaveBeenCalled();
  });
  it('rejects unsupported provider values and extra fields', () => {
    expect(systemOneSettingsSchema.safeParse({ provider: 'other' }).success).toBe(false);
    expect(systemOneSettingsSchema.safeParse({ provider: 'openai', token: 'secret' }).success).toBe(false);
  });
  it('is wired into the production application', async () => {
    const { AppModule } = await import('../src/app.module.js');
    expect(Reflect.getMetadata('providers', AppModule)).toContainEqual({ provide: SystemOneSelector, useClass: ConfigurableSystemOneSelector });
  });
});

it('does not start a provider after cancellation or a settings read failure', async () => {
  const openai = adapter(); const typesafe = adapter();
  const controller = new AbortController();
  const repository = { getSystemOneSettings: vi.fn(async () => { controller.abort(); return { provider: 'openai' }; }) };
  const selector = new ConfigurableSystemOneSelector(repository as never, openai as never, typesafe as never);
  await expect(selector.estimateProbability(decision, controller.signal)).rejects.toThrow();
  repository.getSystemOneSettings.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(selector.estimateProbability(decision, AbortSignal.timeout(1000))).rejects.toThrow('Storage unavailable');
  expect(openai.estimateProbability).not.toHaveBeenCalled(); expect(typesafe.estimateProbability).not.toHaveBeenCalled();
});
