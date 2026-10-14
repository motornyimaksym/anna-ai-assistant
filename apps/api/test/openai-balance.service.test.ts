import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiBalanceService } from '../src/openai-balance.service.js';

const now = new Date('2026-10-14T14:00:00.000Z');
const costPage = (value: number) => ({
  data: [{ results: [{ amount: { value, currency: 'usd' } }] }],
  has_more: false,
  next_page: null,
});
const createService = (baseline?: { balance: number; updatedAt: string }) => {
  const repository = { getOpenAiBalanceBaseline: vi.fn(async () => baseline) };
  return { service: new OpenAiBalanceService(repository as never), repository };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('OpenAiBalanceService', () => {
  it('clamps the default API launch baseline to available Costs history', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv('OPENAI_ADMIN_KEY', 'test-admin-key');
    vi.stubEnv('OPENAI_TOTAL_CREDITS', undefined);
    vi.stubEnv('OPENAI_CREDITS_START_TIME', undefined);
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      const startTime = Number(url.searchParams.get('start_time'));
      const earliestSupported = Math.floor(now.getTime() / 1000) - 365 * 86_400;
      if (startTime < earliestSupported) {
        return new Response(JSON.stringify({ error: { code: 'reporting_lookback_exceeded' } }), { status: 400 });
      }
      return new Response(JSON.stringify(costPage(13.45)));
    });
    vi.stubGlobal('fetch', fetcher);
    const { service } = createService();

    const balance = await service.getBalance();

    expect(balance).toMatchObject({ totalCredits: null, used: 13.45, estimatedRemaining: null, currency: 'usd' });
    expect(Number(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get('start_time')))
      .toBe(Math.floor(now.getTime() / 1000) - 364 * 86_400);
  });

  it('does not estimate remaining balance when saved baseline is outside Costs history', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv('OPENAI_ADMIN_KEY', 'test-admin-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(costPage(12.5)))));
    const { service } = createService({ balance: 100, updatedAt: '2025-01-01T00:00:00.000Z' });

    const balance = await service.getBalance();

    expect(balance).toMatchObject({ totalCredits: 100, used: 12.5, estimatedRemaining: null });
  });

  it('calculates remaining balance from a baseline within Costs history', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv('OPENAI_ADMIN_KEY', 'test-admin-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(costPage(12.5)))));
    const { service } = createService({ balance: 100, updatedAt: '2026-10-01T00:00:00.000Z' });

    const balance = await service.getBalance();

    expect(balance).toMatchObject({ totalCredits: 100, used: 12.5, estimatedRemaining: 87.5 });
  });
});
