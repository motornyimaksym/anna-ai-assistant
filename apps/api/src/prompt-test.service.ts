import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { promptTestRequestSchema, promptTestResponseSchema, type PromptTestRequest, type PromptTestResponse } from '@booking/contracts';
import { z } from 'zod';
import { DEFAULT_KNOWLEDGE_BASE } from './default-knowledge-base.js';
import { safeErrorCategory } from './debug-log.service.js';
import { assistantToolDefinitions } from './openai.service.js';
import { requestOpenAiResponse } from './openai-transport.js';
import { BookingRepository } from './repository.js';
import { SystemOneSelector, systemOneProbabilitySchema } from './system-one.js';
import { systemTwoInstructions, systemTwoRag, systemTwoRequestContext } from './system-two-instructions.js';
import { TextUtils } from './text-utils.js';

const responseSchema = z.object({
  status: z.literal('completed'),
  output: z.array(z.object({
    type: z.string(), name: z.string().optional(), arguments: z.string().optional(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).optional(),
  }).passthrough()),
});
const sampleProposal = 'Sample proposal: 60-minute massage tomorrow at 10:00. Reply to approve or reject this proposal.';
const outputText = (response: z.infer<typeof responseSchema>): string => response.output
  .filter((item) => item.type === 'message')
  .flatMap((item) => item.content ?? [])
  .filter((item) => item.type === 'output_text')
  .map((item) => item.text ?? '')
  .join('\n').trim();
@Injectable()
export class PromptTestService {
  constructor(private readonly repository: BookingRepository, private readonly selector: SystemOneSelector) {}

  async run(raw: unknown): Promise<PromptTestResponse> {
    const parsed = promptTestRequestSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Invalid prompt test request');
    const request = parsed.data;
    try {
      const result = request.system === 'one' ? await this.systemOne(request) : await this.systemTwo(request);
      return promptTestResponseSchema.parse(result);
    } catch (error) {
      throw new ServiceUnavailableException(`Prompt test failed (${safeErrorCategory(error)}).`);
    }
  }

  private async systemOne(request: Extract<PromptTestRequest, { system: 'one' }>): Promise<PromptTestResponse> {
    const signal = AbortSignal.timeout(45_000);
    const [knowledge, services] = await Promise.all([this.repository.getKnowledgeBaseOverride(), this.repository.listServices()]);
    const input = {
      question: 'Estimate human handoff probability for knowledge gaps, bot-like wording or explicit booking confirmation. Confirmation MUST return exactly 1 (100%).',
      context: JSON.stringify({ current_message: request.text, recent_messages: [{ role: 'assistant', content: sampleProposal }, { role: 'user', content: request.text }], proposed_reply: 'Дякую, уточню деталі.', knowledge: knowledge?.content ?? DEFAULT_KNOWLEDGE_BASE, services: services.filter((service) => service.enabled) }),
    };
    const result = systemOneProbabilitySchema.parse(await this.selector.estimateProbability(input, signal));
    return { kind: 'decision', output: String(result), sampleContext: true };
  }

  private async systemTwo(request: Extract<PromptTestRequest, { system: 'two' }>): Promise<PromptTestResponse> {
    const [override, knowledge, services] = await Promise.all([
      this.repository.getPromptOverride('assistant'),
      this.repository.getKnowledgeBaseOverride(), this.repository.listServices(),
    ]);
    const instructions = systemTwoInstructions({ promptOverride: override?.prompt });
    const rag = systemTwoRag({ message: request.text, knowledgeBaseOverride: knowledge?.content, configuredServices: services });
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const requestContext = systemTwoRequestContext({ instructions, rag, history: [], message: request.text, model });
    const selectedTools = assistantToolDefinitions;
    const response = responseSchema.parse(await requestOpenAiResponse({ store: false, model, ...requestContext, tools: selectedTools, parallel_tool_calls: false, max_output_tokens: 800 }, AbortSignal.timeout(30_000)));
    const calls = response.output.filter((item) => item.type === 'function_call');
    if (calls.some(({ name }) => !selectedTools.some((tool) => tool.name === name))) throw new Error('Unsupported tool');
    if (calls.length) return { kind: 'tool_calls', output: TextUtils.replaceLongDashes(JSON.stringify(calls.map(({ name, arguments: args }) => ({ name, arguments: args ? JSON.parse(args) : {} })), null, 2)), sampleContext: false };
    const text = outputText(response);
    if (!text) throw new Error('Empty model reply');
    return { kind: 'text', output: TextUtils.replaceLongDashes(text.slice(0, 12_000)), sampleContext: false };
  }

}
