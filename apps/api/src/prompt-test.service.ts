import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { bookingPlanSchema, promptTestRequestSchema, promptTestResponseSchema, type PromptTestRequest, type PromptTestResponse } from '@booking/contracts';
import { z } from 'zod';
import { APPROVAL_QUESTION } from './confirmation-prompt.js';
import { BOOKING_MANDATORY_GUIDANCE, BOOKING_OUTPUT_FORMAT, BOOKING_SYSTEM_PROMPT } from './booking-prompt.js';
import { DEFAULT_KNOWLEDGE_BASE } from './default-knowledge-base.js';
import { safeErrorCategory } from './debug-log.service.js';
import { assistantToolDefinitions } from './openai.service.js';
import { requestOpenAiResponse } from './openai-transport.js';
import { BookingRepository } from './repository.js';
import { SystemOneSelector, systemOneBooleanSchema, systemOneProbabilitySchema } from './system-one.js';
import { SYSTEM_TWO_PROMPTS, systemTwoPromptIdSchema } from './system-two.js';
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
const sampleEvidence = (message: string) => JSON.stringify({ message, history: [{ role: 'assistant', content: sampleProposal }], proposal: { action: 'create_booking', confirmationText: sampleProposal } });
const outputText = (response: z.infer<typeof responseSchema>): string => response.output
  .filter((item) => item.type === 'message')
  .flatMap((item) => item.content ?? [])
  .filter((item) => item.type === 'output_text')
  .map((item) => item.text ?? '')
  .join('\n').trim();
const sampleDate = (date: Date, timezone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = (part: string) => parts.find((item) => item.type === part)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

@Injectable()
export class PromptTestService {
  constructor(private readonly repository: BookingRepository, private readonly selector: SystemOneSelector) {}

  async run(raw: unknown): Promise<PromptTestResponse> {
    const parsed = promptTestRequestSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Invalid prompt test request');
    const request = parsed.data;
    try {
      const result = request.system === 'one' ? await this.systemOne(request) : request.promptId === 'booking-planner' ? await this.bookingPlanner(request) : await this.systemTwo(request);
      return promptTestResponseSchema.parse(result);
    } catch (error) {
      throw new ServiceUnavailableException(`Prompt test failed (${safeErrorCategory(error)}).`);
    }
  }

  private async systemOne(request: Extract<PromptTestRequest, { system: 'one' }>): Promise<PromptTestResponse> {
    const signal = AbortSignal.timeout(45_000);
    if (request.promptId === 'routing') return { kind: 'decision', output: systemTwoPromptIdSchema.parse(await this.selector.select({ message: request.text, history: [], summary: '', hasPendingProposal: false }, signal)), sampleContext: false };
    const question = request.promptId === 'approval' ? APPROVAL_QUESTION : 'Does the current client message explicitly and unconditionally approve the fixed sample proposal?';
    const input = { question, context: sampleEvidence(request.text) };
    const result = request.promptId === 'probability' ? systemOneProbabilitySchema.parse(await this.selector.estimateProbability(input, signal)) : systemOneBooleanSchema.parse(await this.selector.answerBoolean(input, signal));
    return { kind: 'decision', output: String(result), sampleContext: true };
  }

  private async systemTwo(request: Extract<PromptTestRequest, { system: 'two' }> & { promptId: 'general' | 'booking-conversation' }): Promise<PromptTestResponse> {
    const promptId = request.promptId === 'general' ? 'general' : 'booking';
    const [override, knowledge, services] = await Promise.all([
      promptId === 'general' ? this.repository.getAssistantPromptOverride() : this.repository.getPromptOverride('booking-conversation'),
      this.repository.getKnowledgeBaseOverride(), this.repository.listServices(),
    ]);
    const instructions = systemTwoInstructions({ promptId, promptOverride: override?.prompt });
    const rag = systemTwoRag({ message: request.text, knowledgeBaseOverride: knowledge?.content, configuredServices: services });
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const requestContext = systemTwoRequestContext({ instructions, rag, history: [], message: request.text, model });
    const selectedTools = assistantToolDefinitions.filter((item) => SYSTEM_TWO_PROMPTS[promptId].tools.includes(item.name));
    const response = responseSchema.parse(await requestOpenAiResponse({ store: false, model, ...requestContext, tools: selectedTools, parallel_tool_calls: false, max_output_tokens: 800 }, AbortSignal.timeout(30_000)));
    const calls = response.output.filter((item) => item.type === 'function_call');
    if (calls.some(({ name }) => !selectedTools.some((tool) => tool.name === name))) throw new Error('Unsupported tool');
    if (calls.length) return { kind: 'tool_calls', output: TextUtils.replaceLongDashes(JSON.stringify(calls.map(({ name, arguments: args }) => ({ name, arguments: args ? JSON.parse(args) : {} })), null, 2)), sampleContext: false };
    const text = outputText(response);
    if (!text) throw new Error('Empty model reply');
    return { kind: 'text', output: TextUtils.replaceLongDashes(text.slice(0, 12_000)), sampleContext: false };
  }

  private async bookingPlanner(request: Extract<PromptTestRequest, { system: 'two' }> & { promptId: 'booking-planner' }): Promise<PromptTestResponse> {
    const [override, knowledge, services] = await Promise.all([this.repository.getBookingPromptOverride(), this.repository.getKnowledgeBaseOverride(), this.repository.listServices()]);
    const now = new Date();
    const timezone = process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv';
    const date = sampleDate(new Date(now.getTime() + 24 * 60 * 60_000), timezone);
    const payload = {
      intent: request.intent, question: request.text, history: [], summary: '', currentTime: now.toISOString(), timezone,
      services: services.filter((service) => service.enabled).map(({ id, name, description, durationMinutes, durationOptions, bufferMinutes, price, currency }) => ({ id, name, description, durationMinutes, durationOptions, bufferMinutes, price, currency })),
      knowledge: knowledge?.content ?? DEFAULT_KNOWLEDGE_BASE,
      messages: [{ text: `Sample schedule for ${date}: available starts at 10:00, 12:00, and 14:00.`, createdAt: now.toISOString() }],
      calendarRange: { start: now.toISOString(), end: new Date(now.getTime() + 30 * 24 * 60 * 60_000).toISOString() }, busy: [], ownedBooking: null,
    };
    const response = responseSchema.parse(await requestOpenAiResponse({ store: false, instructions: `${override?.prompt ?? BOOKING_SYSTEM_PROMPT}\n${BOOKING_MANDATORY_GUIDANCE}`, input: [{ role: 'user', content: JSON.stringify(payload) }], text: { format: BOOKING_OUTPUT_FORMAT }, max_output_tokens: 3000 }, AbortSignal.timeout(30_000)));
    const plan = bookingPlanSchema.parse(JSON.parse(outputText(response)));
    return { kind: 'plan', output: TextUtils.replaceLongDashes(JSON.stringify(plan, null, 2)), sampleContext: true };
  }
}
