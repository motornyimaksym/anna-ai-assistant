import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { requestOpenAiResponse } from './openai-transport.js';
import { BookingRepository } from './repository.js';
import { SYSTEM_ONE_REWRITE_PROMPT } from './system-one-rewrite-prompt.js';

export const systemOneRewriteInputSchema = z.object({
  recentMessages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4_000) }).strict()).max(4),
  messageToRewrite: z.string().trim().min(1).max(4_000),
}).strict();
export type SystemOneRewriteInput = z.infer<typeof systemOneRewriteInputSchema>;
export const systemOneRewriteOutputSchema = z.string().trim().min(1).max(4_000);

const responseSchema = z.object({
  status: z.string(),
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).optional(),
  }).passthrough()),
});

@Injectable()
export class SystemOneRewriter {
  constructor(private readonly repository: BookingRepository) {}

  async rewrite(rawInput: SystemOneRewriteInput, version: 'v1' | 'v2', signal: AbortSignal): Promise<string> {
    const input = systemOneRewriteInputSchema.parse(rawInput);
    const override = await this.repository.getPromptOverride('rewrite');
    const model = version === 'v2' ? 'gpt-6.1-sol' : 'gpt-6-luna';
    const response = responseSchema.parse(await requestOpenAiResponse({
      model,
      store: false,
      instructions: override?.prompt ?? SYSTEM_ONE_REWRITE_PROMPT,
      input: [{ role: 'user', content: JSON.stringify({ recent_messages: input.recentMessages, message_to_rewrite: input.messageToRewrite }) }],
      max_output_tokens: 4_096,
    }, AbortSignal.any([signal, AbortSignal.timeout(30_000)]), 's1_rewrite'));
    if (response.status !== 'completed') throw new Error('OpenAI System One rewrite incomplete');
    const text = response.output
      .filter((item) => item.type === 'message')
      .flatMap((item) => item.content ?? [])
      .filter((item) => item.type === 'output_text')
      .map((item) => item.text ?? '')
      .join('')
      .trim();
    return systemOneRewriteOutputSchema.parse(text);
  }
}
