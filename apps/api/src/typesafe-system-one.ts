import { traceProviderRequest } from './request-diagnostics.js';
import { Injectable } from '@nestjs/common';
import { fetchWithLinearBackoff } from '@booking/http';
import { z } from 'zod';
import { SystemOneSelector, systemOneDecisionInputSchema, systemOneProbabilitySchema, type SystemOneDecisionInput } from './system-one.js';
import { BookingRepository } from './repository.js';
import { HANDOFF_PROMPT } from './handoff-prompt.js';

const envelopeSchema = z.object({ model: z.string().min(1), answers: z.object({ decision: z.unknown() }).strict() });

@Injectable()
export class TypeSafeSystemOneSelector extends SystemOneSelector {
  constructor(private readonly repository: BookingRepository) { super(); }
  async estimateProbability(input: SystemOneDecisionInput, signal: AbortSignal): Promise<number> {
    const { question, context } = systemOneDecisionInputSchema.parse(input);
    const override = await this.repository.getPromptOverride('handoff');
    const answer = await this.request(context, { type: 'noul', instructions: `${question}\n${override?.prompt ?? ''}\n${HANDOFF_PROMPT}` }, signal);
    return z.object({ type: z.literal('noul'), noul: systemOneProbabilitySchema }).parse(answer).noul;
  }

  private async request(state: unknown, question: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    const token = process.env.TYPESAFE_AI_TOKEN?.trim();
    if (!token) throw new Error('TypeSafe is not configured');
    const payload = { model: 'jev-latest', state, questions: { decision: question } };
    const operation = 's1_handoff';
    const raw = await traceProviderRequest({ provider: 'typesafe', operation, endpoint: 'https://api.typesafe.ai/v1/systemone' }, payload, async (observer) => {
      const response = await fetchWithLinearBackoff('https://api.typesafe.ai/v1/systemone', {
        method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, { replaySafe: true, onAttempt: observer.attempt });
      await observer.response(response);
      if (!response.ok) throw Object.assign(new Error(`TypeSafe HTTP ${response.status}`), { upstreamStatus: response.status, providerRequestId: response.headers?.get('x-request-id') ?? undefined });
      return response.json();
    });
    return envelopeSchema.parse(raw).answers.decision;
  }
}
