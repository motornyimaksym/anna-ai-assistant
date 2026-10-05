import { ServiceUnavailableException, Injectable } from '@nestjs/common';
import { openAiBalanceResponseSchema, type OpenAiBalanceResponse } from '@booking/contracts';
import { loadBackendRuntimeEnv } from '@booking/config';
import { fetchWithLinearBackoff } from '@booking/http';
import { z } from 'zod';

const costsPageSchema = z.object({
  data: z.array(z.object({
    results: z.array(z.object({
      amount: z.object({ value: z.number().finite().optional(), currency: z.string().optional() }).nullish().optional(),
    }).passthrough()),
  }).passthrough()),
  has_more: z.boolean(),
  next_page: z.string().nullable(),
}).passthrough();

const unavailable = () => new ServiceUnavailableException('OpenAI balance is unavailable. Try again later.');
const openAiApiStartTime = 1_591_833_600; // June 11, 2020: public OpenAI API launch.
const costBucketPageSize = 180;
const secondsPerDay = 86_400;

@Injectable()
export class OpenAiBalanceService {
  private cached?: { value: OpenAiBalanceResponse; expiresAt: number };
  private inFlight?: Promise<OpenAiBalanceResponse>;

  async getBalance(): Promise<OpenAiBalanceResponse> {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.value;
    if (this.inFlight) return this.inFlight;

    const request = this.loadBalance();
    this.inFlight = request;
    try {
      return await request;
    } finally {
      if (this.inFlight === request) this.inFlight = undefined;
    }
  }

  private async loadBalance(): Promise<OpenAiBalanceResponse> {
    const adminKey = process.env.OPENAI_ADMIN_KEY?.trim();
    if (!adminKey) throw unavailable();
    const totalCredits = loadBackendRuntimeEnv(process.env).OPENAI_TOTAL_CREDITS ?? null;
    const endTime = Math.floor(Date.now() / 1000);
    const deadline = AbortSignal.timeout(60_000);
    const maxPages = Math.ceil((endTime - openAiApiStartTime) / (costBucketPageSize * secondsPerDay)) + 1;
    const cursors = new Set<string>();
    let cursor: string | undefined;
    let used = 0;
    let complete = false;

    for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
      const url = new URL('https://api.openai.com/v1/organization/costs');
      url.searchParams.set('start_time', String(openAiApiStartTime));
      url.searchParams.set('end_time', String(endTime));
      url.searchParams.set('bucket_width', '1d');
      url.searchParams.set('limit', String(costBucketPageSize));
      if (cursor) url.searchParams.set('page', cursor);

      let response: Response;
      try {
        response = await fetchWithLinearBackoff(url, {
          headers: { authorization: `Bearer ${adminKey}`, 'content-type': 'application/json' },
          signal: deadline,
        }, { timeoutMs: 15_000, rateLimitResetHeaders: true, retryDelaysMs: [1_000, 5_000, 15_000] });
      } catch {
        throw unavailable();
      }
      if (!response.ok) throw unavailable();

      const body = await response.json().catch(() => undefined);
      const page = costsPageSchema.safeParse(body);
      if (!page.success) throw unavailable();
      for (const bucket of page.data.data) {
        for (const result of bucket.results) {
          const amount = result.amount;
          if (!amount || amount.value === undefined) continue;
          if (amount.currency?.toLowerCase() !== 'usd') throw unavailable();
          used += amount.value;
          if (!Number.isFinite(used)) throw unavailable();
        }
      }

      if (!page.data.next_page) {
        if (page.data.has_more) throw unavailable();
        complete = true;
        break;
      }
      if (cursors.has(page.data.next_page)) throw unavailable();
      cursors.add(page.data.next_page);
      cursor = page.data.next_page;
    }

    if (!complete) throw unavailable();
    const value = openAiBalanceResponseSchema.parse({
      totalCredits,
      used: Math.round(used * 1e8) / 1e8,
      estimatedRemaining: totalCredits === null ? null : Math.round((totalCredits - used) * 1e8) / 1e8,
      currency: 'usd',
      updatedAt: new Date().toISOString(),
    });
    this.cached = { value, expiresAt: Date.now() + 5 * 60_000 };
    return value;
  }
}
