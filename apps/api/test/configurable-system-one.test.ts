import { describe, expect, it, vi } from 'vitest';
import { ConfigurableSystemOneSelector } from '../src/configurable-system-one.js';
import { SystemOneSelector } from '../src/system-one.js';
import { systemOneSettingsSchema } from '@booking/contracts';
const routing = { message: 'Так підходить', summary: '', history: [], hasPendingProposal: true };
const decision = { question: 'Approve?', context: 'Так підходить' };
const adapter = () => ({ select: vi.fn(async () => 'booking'), answerBoolean: vi.fn(async () => true), estimateProbability: vi.fn(async () => 0.9) });

describe('configured System One provider', () => {
  it.each(['select', 'answerBoolean', 'estimateProbability'] as const)('uses OpenAI by default for %s and switches on the next decision', async (method) => {
    const repository = { getSystemOneSettings: vi.fn().mockResolvedValue({ provider: 'openai' }) };
    const openai = adapter(); const typesafe = adapter();
    const selector = new ConfigurableSystemOneSelector(repository as never, openai as never, typesafe as never);
    const run = () => method === 'select' ? selector.select(routing, AbortSignal.timeout(1000)) : selector[method](decision, AbortSignal.timeout(1000));
    await run(); expect(openai[method]).toHaveBeenCalledOnce(); expect(typesafe[method]).not.toHaveBeenCalled();
    repository.getSystemOneSettings.mockResolvedValue({ provider: 'typesafe' });
    await run(); expect(typesafe[method]).toHaveBeenCalledOnce(); expect(repository.getSystemOneSettings).toHaveBeenCalledTimes(2);
  });
  it('never calls TypeSafe after an OpenAI failure or negative approval', async () => {
    const openai = adapter(); const typesafe = adapter();
    const selector = new ConfigurableSystemOneSelector({ getSystemOneSettings: vi.fn(async () => ({ provider: 'openai' })) } as never, openai as never, typesafe as never);
    openai.answerBoolean.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('unavailable'));
    expect(await selector.answerBoolean(decision, AbortSignal.timeout(1000))).toBe(false);
    await expect(selector.answerBoolean(decision, AbortSignal.timeout(1000))).rejects.toThrow('unavailable');
    expect(typesafe.answerBoolean).not.toHaveBeenCalled();
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
  await expect(selector.select(routing, controller.signal)).rejects.toThrow();
  repository.getSystemOneSettings.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(selector.select(routing, AbortSignal.timeout(1000))).rejects.toThrow('Storage unavailable');
  expect(openai.select).not.toHaveBeenCalled(); expect(typesafe.select).not.toHaveBeenCalled();
});
