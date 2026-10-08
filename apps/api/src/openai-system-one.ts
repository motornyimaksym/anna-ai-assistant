import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { requestOpenAiResponse } from './openai-transport.js';
import { SystemOneSelector, systemOneDecisionInputSchema, systemOneProbabilitySchema, type SystemOneDecisionInput } from './system-one.js';
import { BookingRepository } from './repository.js';
import { HANDOFF_PROMPT } from './handoff-prompt.js';

export const SYSTEM_ONE_PROBABILITY_PROMPT = HANDOFF_PROMPT;

const decisionMessageSchema = z.object({
  type: z.literal('message'),
  content: z.array(z.object({ type: z.literal('output_text'), text: z.string() })).length(1),
});
const responseSchema = z.object({
  status: z.literal('completed'),
  output: z.array(z.discriminatedUnion('type', [
    decisionMessageSchema,
    z.object({ type: z.literal('reasoning') }),
  ]))
    // Ignore provider reasoning metadata; never interpret it as the decision.
    .transform((items) => items.filter((item) => item.type === 'message'))
    .pipe(z.array(decisionMessageSchema).length(1)),
});

@Injectable()
export class OpenAiSystemOneSelector extends SystemOneSelector {
  constructor(private readonly repository: BookingRepository) { super(); }
  private async requestDecision(body: Record<string, unknown>, signal: AbortSignal) {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
    for (const maxOutputTokens of [4096, 8192]) {
      deadline.throwIfAborted();
      const response = await requestOpenAiResponse({ ...body, max_output_tokens: maxOutputTokens }, deadline);
      if (response && typeof response === 'object' && 'status' in response && response.status === 'incomplete') {
        const details = 'incomplete_details' in response ? response.incomplete_details : undefined;
        const exhausted = !!details && typeof details === 'object' && 'reason' in details && details.reason === 'max_output_tokens';
        if (exhausted && maxOutputTokens === 4096) continue;
        throw Object.assign(new Error(exhausted ? 'OpenAI System One output token limit reached' : 'OpenAI System One response incomplete'), {
          code: exhausted ? 'OPENAI_DECISION_TOKEN_LIMIT' : 'OPENAI_DECISION_INCOMPLETE',
        });
      }
      return responseSchema.parse(response);
    }
    throw new Error('OpenAI System One decision unavailable');
  }
  async estimateProbability(input: SystemOneDecisionInput, signal: AbortSignal): Promise<number> {
    const override = await this.repository.getPromptOverride('handoff');
    const value = await this.decision([override?.prompt, SYSTEM_ONE_PROBABILITY_PROMPT].filter(Boolean).join('\n\n'), 'probability_estimate', 'probability', { type: 'number', minimum: 0, maximum: 1 }, input, signal);
    return z.object({ probability: systemOneProbabilitySchema }).strict().parse(value).probability;
  }
  private async decision(instructions: string, name: string, field: string, property: Record<string, unknown>, input: SystemOneDecisionInput, signal: AbortSignal): Promise<unknown> {
    const response = await this.requestDecision({
      instructions,
      input: [{ role: 'user', content: JSON.stringify(systemOneDecisionInputSchema.parse(input)) }],
      text: { format: { type: 'json_schema', name, strict: true, schema: {
        type: 'object', additionalProperties: false, properties: { [field]: property }, required: [field],
      } } },
    }, signal);
    return JSON.parse(response.output[0]!.content[0]!.text);
  }
}
