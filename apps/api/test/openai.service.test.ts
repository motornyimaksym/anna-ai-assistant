import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SystemOneInput } from '../src/system-one.js';
import { SYSTEM_TWO_PROMPTS, type SystemTwoPromptId } from '../src/system-two.js';
import { OpenAiService } from '../src/openai.service.js';
import { TELEGRAM_FORMAT_GUIDANCE, THERAPIST_FIRST_PERSON_GUIDANCE } from '../src/assistant-prompt.js';
import type { AssistantToolsService } from '../src/assistant-tools.service.js';
import type { BookingRepository } from '../src/repository.js';
import type { BookingPlannerService } from '../src/booking-planner.service.js';
import type { DebugLogService } from '../src/debug-log.service.js';
import type { ServiceDto } from '@booking/contracts';
const conversation = { telegramChatId: 'chat', clientId: 'alice', openaiConversationId: 'conv-existing', assistantEnabled: true, state: 'active', summary: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const context = { clientId: 'alice', telegramChatId: 'chat' };
const setup = (promptId: SystemTwoPromptId = 'general') => {
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  const repository = { getService: vi.fn(async () => ({ id: 'massage', name: 'Massage', durationMinutes: 60, price: 1500, durationOptions: [{ durationMinutes: 90, price: 2000 }], currency: 'UAH', enabled: true })), listMessages: vi.fn(async () => []), getAssistantPromptOverride: vi.fn(async () => undefined), getPromptOverride: vi.fn(async () => undefined as { prompt: string; updatedAt: string } | undefined), getKnowledgeBaseOverride: vi.fn(async () => undefined), listServices: vi.fn(async () => [] as ServiceDto[]), replacePendingAction: vi.fn(async () => true), replaceOpenAiConversation: vi.fn(async () => {}), ensureOpenAiConversation: vi.fn(async () => 'conv-created'), saveConversation: vi.fn(async (value: typeof conversation & { pendingAction?: unknown }) => value), appendMessage: vi.fn() };
  const tools = { execute: vi.fn(async (): Promise<unknown> => ({ id: 'booking-1', startAt: '2099-01-01T10:00:00.000Z', status: 'confirmed', calendarSyncStatus: 'synced' })) };
  const plan = vi.fn(async (..._args: unknown[]) => ({ status: 'ready', serviceId: 'massage', startAt: '2099-01-01T10:00:00.000Z', durationMinutes: 90, candidateStarts: [], question: null }));
  const evidence = { timezone: 'Europe/Kyiv', sourceSyncedAt: '2098-12-31T12:00:00.000Z', scheduleMessages: [{ text: 'Вт: 16:00', createdAt: '2098-12-31T12:00:00.000Z' }], calendar: { status: 'ready', checkedAt: '2098-12-31T12:00:00.000Z', rangeStart: '2098-12-31T12:00:00.000Z', rangeEnd: '2099-01-30T12:00:00.000Z', busy: [] } };
  const planner = { plan, planWithContext: vi.fn(async (...args: unknown[]) => ({ plan: await plan(...args), evidence })) };
  const debug = { record: vi.fn(async () => {}) };
  const selector = { answerBoolean: vi.fn(async () => false), estimateProbability: vi.fn(async () => 0.5), select: vi.fn(async (_input: SystemOneInput, _signal: AbortSignal) => promptId) };
  const service = new OpenAiService(repository as unknown as BookingRepository, tools as unknown as AssistantToolsService, planner as unknown as BookingPlannerService, debug as unknown as DebugLogService, selector);
  return { repository, tools, planner, debug, selector, service };
};
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('OpenAI conversation', () => {
  it('accepts a completed response with null incomplete details', async () => {
    const { service } = setup('booking');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'completed', incomplete_details: null, output: [{ type: 'message', content: [{ type: 'output_text', text: 'Яку послугу бажаєте?' }] }] }) }));
    expect(await service.respond(conversation, context, 'Хочу записатися')).toEqual({ text: 'Яку послугу бажаєте?', fromOpenAI: true });
  });
  it('reserves reasoning headroom and safely rejects incomplete Booking output', async () => {
    const { service, tools, repository } = setup('booking');
    vi.stubEnv('OPENAI_MODEL', 'gpt-6-luna');
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'reasoning' }] }) });
    vi.stubGlobal('fetch', fetch);
    const reply = await service.respond(conversation, context, 'Запиши мене');
    const request = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(request.max_output_tokens).toBe(4096);
    expect(request.reasoning).toEqual({ effort: 'low' });
    expect(reply.needsHuman).toBe(true);
    expect(tools.execute).not.toHaveBeenCalled();
    expect(repository.replacePendingAction).not.toHaveBeenCalled();
  });
  it('recovers a poisoned conversation once without replaying historical tools', async () => {
    const { service, repository, tools } = setup();
    repository.listMessages.mockResolvedValue([{ role: 'user', content: 'Earlier question' }, { role: 'assistant', content: 'Earlier reply' }]);
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { param: 'input', message: 'No tool output found for function call call_broken.' } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'conv-recovered' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello' }] }] })));
    vi.stubGlobal('fetch', fetch);
    expect(await service.respond(conversation, context, 'Hi')).toEqual({ text: 'Hello', fromOpenAI: true });
    expect(repository.replaceOpenAiConversation).toHaveBeenCalledWith('chat', 'alice', 'conv-existing', 'conv-recovered');
    const retry = JSON.parse(fetch.mock.calls[2]![1].body);
    expect(retry.conversation).toBe('conv-recovered');
    expect(retry.input.slice(2)).toEqual([{ role: 'user', content: 'Earlier question' }, { role: 'assistant', content: 'Earlier reply' }, { role: 'user', content: 'Hi' }]);
    expect(retry.input[1].content).toContain('Never replay');
    expect(tools.execute).not.toHaveBeenCalled();
  });
  it.each(['other', 'repeated', 'after-tool'])('does not reset or replay on %s errors', async (kind) => {
    const { service, repository, tools } = setup();
    const failure = () => new Response(JSON.stringify({ error: { param: 'input', message: kind === 'other' ? 'Invalid schema' : 'No tool output found for function call call_broken.' } }), { status: 400 });
    const fetch = vi.fn();
    if (kind === 'after-tool') fetch.mockResolvedValueOnce(new Response(JSON.stringify({ output: [{ type: 'function_call', call_id: 'c1', name: 'get_services', arguments: '{}' }] })));
    fetch.mockResolvedValueOnce(failure());
    if (kind === 'repeated') fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'conv-recovered' }))).mockResolvedValueOnce(failure());
    vi.stubGlobal('fetch', fetch);
    expect((await service.respond(conversation, context, 'Hi')).needsHuman).toBe(true);
    expect(repository.replaceOpenAiConversation).toHaveBeenCalledTimes(kind === 'repeated' ? 1 : 0);
    expect(tools.execute).toHaveBeenCalledTimes(kind === 'after-tool' ? 1 : 0);
    expect(fetch).toHaveBeenCalledTimes(kind === 'repeated' ? 3 : kind === 'after-tool' ? 2 : 1);
  });
  it.each([false, true])('closes fourth-round calls, including local replies: %s', async (local) => {
    const { service, tools } = setup('booking');
    tools.execute.mockResolvedValue([]);
    const fetch = vi.fn();
    for (let round = 0; round < 4; round++) fetch.mockResolvedValueOnce(new Response(JSON.stringify({ output: [{ type: 'function_call', call_id: `c${round}`, name: local && round === 3 ? 'plan_booking' : 'get_services', arguments: local && round === 3 ? JSON.stringify({ intent: 'create', bookingId: null }) : '{}' }] })));
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Done reading' }] }] })));
    vi.stubGlobal('fetch', fetch);
    const reply = await service.respond(conversation, context, 'Hi');
    expect(reply.needsHuman).toBeUndefined();
    expect(reply.text).toContain(local ? 'Новий запис' : 'Done reading');
    const closeout = JSON.parse(fetch.mock.calls[4]![1].body);
    expect(closeout.tool_choice).toBe('none');
    expect(closeout.input[0]).toMatchObject({ type: 'function_call_output', call_id: 'c3' });
    expect(tools.execute).toHaveBeenCalledTimes(local ? 3 : 4);
  });
  it('creates a conversation for a legacy Telegram record and sends only the new message', async () => {
    const { service, repository } = setup();
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'conv-created' }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello' }] }] }) });
    vi.stubGlobal('fetch', fetch);
    repository.listMessages.mockResolvedValue([{ role: 'user', content: 'old private text' }]);
    await service.respond({ ...conversation, openaiConversationId: undefined }, context, 'Hi');
    expect(fetch.mock.calls[0]![0]).toBe('https://api.openai.com/v1/conversations');
    expect(repository.ensureOpenAiConversation).toHaveBeenCalledWith('chat', 'alice', 'conv-created');
    const body = JSON.parse(fetch.mock.calls[1]![1].body);
    expect(body.conversation).toBe('conv-created');
    expect(body.input.at(-1)).toEqual({ role: 'user', content: 'Hi' });
    expect(body.input[0].role).toBe('developer');
    expect(body.input[1].role).toBe('developer');
  });
  it('sends bounded recent messages with booking request, current message once', async () => {
    const { service, repository } = setup('booking');
    repository.listMessages.mockResolvedValue([
      ...Array.from({ length: 24 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `old-${index}` })),
      { role: 'user', content: 'Move my booking' },
    ] as never);
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Which booking?' }] }] }) });
    vi.stubGlobal('fetch', fetch);
    await service.respond(conversation, context, 'Move my booking');
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.input).toHaveLength(22);
    expect(body.input[2]).toEqual({ role: 'assistant', content: 'old-5' });
    expect(body.input.at(-1)).toEqual({ role: 'user', content: 'Move my booking' });
  });
  it('allows a longer provider call and records a safe timeout category', async () => {
    const { service } = setup();
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetch = vi.fn(async (_url: string, options: { signal: AbortSignal }) => {
      expect(options.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException('The operation was aborted', 'TimeoutError');
    });
    vi.stubGlobal('fetch', fetch);
    const errorLog = vi.spyOn((service as unknown as { logger: { error: (message: string) => void } }).logger, 'error');
    const reply = await service.respond(conversation, context, 'Hello');
    expect(reply.needsHuman).toBe(true);
    expect(timeout).toHaveBeenCalledWith(60_000);
    expect(timeout).not.toHaveBeenCalledWith(10_000);
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(errorLog).toHaveBeenCalledOnce();
    expect(errorLog.mock.calls[0]![0]).toContain('TimeoutError');
    expect(errorLog.mock.calls[0]![0]).toContain('openai.service.ts');
    expect(errorLog.mock.calls[0]![0]).not.toContain('test-key');
  });
  it('continues function calls and returns the model reply', async () => {
    const { service, tools } = setup();
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'function_call', call_id: 'c1', name: 'get_services', arguments: '{}' }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Вітаю!' }] }] }) });
    vi.stubGlobal('fetch', fetch);
    expect(await service.respond(conversation, context, 'Привіт')).toEqual({ text: 'Вітаю!', fromOpenAI: true });
    expect(tools.execute).toHaveBeenCalledWith({ name: 'get_services', arguments: {} }, context);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('returns catalog facts without automatic Telegram card delivery', async () => {
    const { service, tools } = setup();
    const services = [{ id: 'massage', name: 'Massage', description: 'Relaxing massage', durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH', enabled: true, photoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/massage.jpg?token=x' }];
    tools.execute.mockResolvedValueOnce(services);
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'function_call', call_id: 'c1', name: 'get_services', arguments: '{}' }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Here are the services.' }] }] }) });
    vi.stubGlobal('fetch', fetch);
    expect(await service.respond(conversation, context, 'What services do you have?')).toEqual({ text: 'Here are the services.', fromOpenAI: true });
  });
  it('uses the current stored prompt override for the next assistant request', async () => {
    const { service, repository } = setup();
    repository.getAssistantPromptOverride.mockResolvedValue({ prompt: 'Speak only in short sentences.', updatedAt: '2026-09-24T10:00:00.000Z' });
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello.' }] }] }) }));
    vi.stubGlobal('fetch', fetch);
    await service.respond(conversation, context, 'Hi');
    const instructions = JSON.parse(fetch.mock.calls[0]![1]!.body as string).input[0].content as string;
    expect(instructions).toContain('Speak only in short sentences.');
    expect(instructions).toContain(THERAPIST_FIRST_PERSON_GUIDANCE);
    expect(instructions).toContain('TELEGRAM FORMATTING');
    expect(instructions).toContain(TELEGRAM_FORMAT_GUIDANCE);
  });
  it('uses the Booking conversation override with mandatory guidance', async () => {
    const { service, repository } = setup('booking');
    repository.getPromptOverride.mockResolvedValue({ prompt: 'CUSTOM BOOKING CONVERSATION', updatedAt: new Date().toISOString() });
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Which booking?' }] }] }) }));
    vi.stubGlobal('fetch', fetch);
    await service.respond(conversation, context, 'Move my booking');
    expect(repository.getPromptOverride).toHaveBeenCalledWith('booking-conversation');
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.input[0].content).toContain('CUSTOM BOOKING CONVERSATION');
    expect(body.input[0].content).toContain('plan_booking');
    expect(body.input[0].content).toContain('CONFIRMATION:');
    expect(body.tools.some((tool: { name: string }) => tool.name === 'plan_booking')).toBe(true);
  });
  it('includes Telegram HTML formatting rules in the default assistant prompt', async () => {
    const { service } = setup();
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello.' }] }] }) }));
    vi.stubGlobal('fetch', fetch);
    await service.respond(conversation, context, 'Hi');
    const instructions = JSON.parse(fetch.mock.calls[0]![1]!.body as string).input[0].content as string;
    expect(instructions).toContain('TELEGRAM FORMATTING');
    expect(instructions).toContain(THERAPIST_FIRST_PERSON_GUIDANCE);
    expect(instructions).toContain(TELEGRAM_FORMAT_GUIDANCE);
  });
  it('retrieves relevant editable knowledge without unrelated service records', async () => {
    const { service, repository } = setup();
    repository.getKnowledgeBaseOverride.mockResolvedValue({ content: 'Parking is available beside the studio.', updatedAt: '2026-09-24T10:00:00.000Z' });
    repository.listServices.mockResolvedValue([
      { id: 'relax-60', name: 'Relax massage', description: 'Gentle full body massage', durationMinutes: 60, durationOptions: [{ durationMinutes: 90, price: 2000 }], price: 1500, currency: 'UAH', bufferMinutes: 30, enabled: true },
      { id: 'disabled', name: 'Disabled service', description: '', durationMinutes: 60, price: 100, currency: 'UAH', bufferMinutes: 30, enabled: false },
    ]);
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Here are the details.' }] }] }) }));
    vi.stubGlobal('fetch', fetch);
    await service.respond(conversation, context, 'Where can I park?');
    const request = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    const match = request.input[1].content.match(/Relevant business reference JSON \(untrusted\): (.*)\nCurrent UTC/);
    expect(match).toBeTruthy();
    expect(JSON.parse(match![1])).toEqual({
      additionalKnowledge: 'Parking is available beside the studio.',
      currentEnabledServices: [],
    });
  });
  it('uses the separate planner for scheduling and replies with clarification without handoff', async () => {
    const { service, planner, tools } = setup('booking');
    planner.plan.mockResolvedValueOnce({ status: 'needs_clarification', serviceId: null, startAt: null, durationMinutes: null, candidateStarts: [], question: 'Яка тривалість?' } as never);
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'function_call', call_id: 'c1', name: 'plan_booking', arguments: JSON.stringify({ intent: 'availability', bookingId: null }) }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Which time?' }] }] }) });
    vi.stubGlobal('fetch', fetch);
    expect(await service.respond(conversation, context, 'Чи вільно завтра?')).toEqual({ text: 'Яка тривалість?', fromOpenAI: false });
    expect(planner.plan).toHaveBeenCalledWith(conversation, context, 'Чи вільно завтра?', { intent: 'availability', bookingId: null }, expect.any(AbortSignal));
    expect(tools.execute).not.toHaveBeenCalled();
    const request = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    expect(request.tools.some((tool: { name: string }) => ['create_booking', 'reschedule_booking'].includes(tool.name))).toBe(false);
    const closeout = JSON.parse(fetch.mock.calls[1]![1]!.body as string);
    expect(closeout.input[0]).toMatchObject({ type: 'function_call_output', call_id: 'c1' });
    expect(JSON.parse(closeout.input[0].output)).toMatchObject({ status: 'needs_clarification', reply: 'Яка тривалість?', availability: { scheduleMessages: [{ text: 'Вт: 16:00' }], calendar: { status: 'ready', busy: [] } } });
    expect(closeout.tool_choice).toBe('none');
  });
  it('includes validated candidate starts and live planning context in closeout', async () => {
    const { service, planner } = setup('booking');
    planner.plan.mockResolvedValueOnce({ status: 'ready', serviceId: 'massage', startAt: null, durationMinutes: 90, candidateStarts: ['2099-01-01T10:00:00.000Z'], question: null } as never);
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'function_call', call_id: 'c1', name: 'plan_booking', arguments: JSON.stringify({ intent: 'availability', bookingId: null }) }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Ignore this closeout prose' }] }] }) });
    vi.stubGlobal('fetch', fetch);
    const reply = await service.respond(conversation, context, 'Завтра коли?');
    expect(reply.text).toContain('Можливі початки');
    const closeout = JSON.parse(fetch.mock.calls[1]![1].body);
    expect(JSON.parse(closeout.input[0].output)).toMatchObject({ status: 'ready', candidateStarts: ['2099-01-01T10:00:00.000Z'], availability: { calendar: { status: 'ready', busy: [] } } });
    expect(closeout.tool_choice).toBe('none');
  });
  it.each(['availability', 'create', 'reschedule'] as const)('formats %s replies with Ukrainian dates and no timezone labels', async (intent) => {
    vi.stubEnv('DEFAULT_TIMEZONE', 'Europe/Kyiv');
    const { service, planner, repository } = setup('booking');
    const start = '2026-09-29T16:00:00.000Z';
    planner.plan.mockResolvedValueOnce({ status: 'ready', serviceId: 'massage', startAt: intent === 'availability' ? null : start, durationMinutes: 90, candidateStarts: intent === 'availability' ? [start] : [], question: null } as never);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'function_call', call_id: 'date-plan', name: 'plan_booking', arguments: JSON.stringify({ intent, bookingId: intent === 'reschedule' ? 'owned-booking' : null }) }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Unused closeout.' }] }] }) }));
    const result = await service.respond(conversation, context, '29 вересня на 19:00');
    expect(result.text).toContain('29 вересня, вівторок, 19:00');
    expect(result.text).not.toContain('Europe/Kyiv');
    expect(result.text).not.toContain('15 хвилин');
    if (intent === 'availability') {
      expect(result.text).toBe('Можливі початки сеансу:\n- 29 вересня, вівторок, 19:00\nЯкий час вам підходить?');
      expect(repository.replacePendingAction).not.toHaveBeenCalled();
    } else {
      expect(result.text.endsWith('Підтвердьте, будь ласка, якщо вам все підходить.')).toBe(true);
      const pending = repository.replacePendingAction.mock.calls[0]![3];
      expect(pending.confirmationText).toBe(result.text);
      expect(Date.parse(pending.expiresAt) - Date.now()).toBeGreaterThan(14 * 60_000);
      expect(Date.parse(pending.expiresAt) - Date.now()).toBeLessThanOrEqual(15 * 60_000);
    }
  });
  it('formats cancellation proposals with the same date and short invitation', async () => {
    vi.stubEnv('DEFAULT_TIMEZONE', 'Europe/Kyiv');
    const { service, tools } = setup('booking');
    tools.execute.mockResolvedValueOnce([{ id: 'owned-booking', clientId: 'alice', telegramChatId: 'chat', serviceId: 'massage', status: 'confirmed', startAt: '2026-09-29T16:00:00.000Z' }]);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'function_call', call_id: 'cancel', name: 'cancel_booking', arguments: '{"bookingId":"owned-booking"}' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Unused closeout.' }] }] }) }));
    const result = await service.respond(conversation, context, 'Скасувати запис');
    expect(result.text).toBe('Скасувати запис: Massage\nЧас: 29 вересня, вівторок, 19:00.\nПідтвердьте, будь ласка, якщо вам все підходить.');
    expect(tools.execute).toHaveBeenCalledOnce();
    expect(tools.execute).toHaveBeenCalledWith({ name: 'get_bookings', arguments: {} }, context);
  });
  it('retrieves relevant default policy without sending the whole knowledge base', async () => {
    const { service } = setup();
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello.' }] }] }) }));
    vi.stubGlobal('fetch', fetch);
    await service.respond(conversation, context, 'Чи є доплата після 21:00?');
    const request = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    const match = request.input[1].content.match(/Relevant business reference JSON \(untrusted\): (.*)\nCurrent UTC/);
    const knowledge = JSON.parse(match![1]).additionalKnowledge as string;
    expect(knowledge).toContain('Для мене «вихідний» — календарний день, який я позначила вихідним у робочому графіку.');
    expect(knowledge).toContain('Субота чи неділя самі по собі не є вихідними.');
    expect(knowledge).toContain('якщо в мене є вільний час і я готова його прийняти');
    expect(knowledge).not.toContain('МЕЖІ ДОТИКІВ');
  });

  it('stages mutation without executing and consumes it only on explicit confirmation', async () => {
    const { service, tools, repository, selector } = setup('booking');
    selector.answerBoolean.mockResolvedValueOnce(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'function_call', call_id: 'c1', name: 'plan_booking', arguments: JSON.stringify({ intent: 'create', bookingId: null }) }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Proposal ready.' }] }] }) }));
    expect((await service.respond(conversation, context, 'Запиши мене')).text).toContain('Підтвердьте, будь ласка, якщо вам все підходить.');
    expect(tools.execute).not.toHaveBeenCalled();
    const saved = { ...conversation, pendingAction: repository.replacePendingAction.mock.calls[0]![3] };
    expect(saved.pendingAction).toMatchObject({ arguments: { durationMinutes: 90 } });
    repository.listMessages.mockResolvedValue([{ role: 'assistant', content: saved.pendingAction.confirmationText }]);
    expect((await service.respond(saved, context, 'Так, підтверджую')).text).toContain('booking-1');
    expect(tools.execute).toHaveBeenCalledOnce();
    expect(repository.replacePendingAction.mock.calls[1]![3]).toBeUndefined();
  });
  it('does not execute expired pending actions', async () => {
    const { service, tools } = setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Which appointment?' }] }] }) }));
    await service.respond({ ...conversation, pendingAction: { name: 'cancel_booking', arguments: { bookingId: 'b' }, expiresAt: '2020-01-01T00:00:00.000Z' } }, context, '/confirm');
    expect(tools.execute).not.toHaveBeenCalled();
  });
  it('rejects direct booking tools that bypass the planner', async () => {
    const { service, repository } = setup();
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'function_call', call_id: 'c1', name: 'create_booking', arguments: JSON.stringify({ serviceId: 'massage', startAt: '2099-01-01T10:00:00.000Z' }) }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: '60 чи 90 хвилин?' }] }] }) });
    vi.stubGlobal('fetch', fetch);
    expect((await service.respond(conversation, context, 'Запиши мене')).needsHuman).toBe(true);
    expect(repository.saveConversation).not.toHaveBeenCalled();
    const request = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(request.tools.find((tool: { name: string }) => tool.name === 'create_booking')).toBeUndefined();
  });
  it('returns a safe fallback when the provider fails', async () => {
    const { service } = setup();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 })));
    expect((await service.respond(conversation, context, 'Привіт')).needsHuman).toBe(true);
  });
});

it('routes explicit model uncertainty to humans without executing a booking tool', async () => {
  const { service, tools } = setup();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'function_call', call_id: 'c1', name: 'request_human_assistance', arguments: '{}' }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Need assistance.' }] }] }) }));
  expect((await service.respond(conversation, context, 'Uncertain request')).needsHuman).toBe(true);
  expect(tools.execute).not.toHaveBeenCalled();
});


describe('System One dispatch', () => {
  it('selects before General and supplies bounded context without business facts', async () => {
    const { service, selector, repository } = setup();
    repository.listMessages.mockResolvedValue(Array.from({ length: 25 }, () => ({ role: 'user', content: 'x'.repeat(5000) })) as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello' }] }] }) }));
    await service.respond({ ...conversation, summary: 's'.repeat(5000) }, context, 'Hi');
    expect(selector.select).toHaveBeenCalledOnce();
    const input = selector.select.mock.calls[0]![0];
    expect(input).toMatchObject({ message: 'Hi', hasPendingProposal: false });
    expect(input.summary).toHaveLength(4000);
    expect(input.history).toHaveLength(20);
    expect(input.history[0].content).toHaveLength(4000);
    expect(Object.keys(input).sort()).toEqual(['hasPendingProposal', 'history', 'message', 'summary']);
    expect(selector.select.mock.invocationCallOrder[0]).toBeLessThan(repository.getAssistantPromptOverride.mock.invocationCallOrder[0]!);
  });
  it('isolates Booking from the General override while retaining media tools', async () => {
    const { service, repository, selector } = setup('booking');
    repository.getAssistantPromptOverride.mockResolvedValue({ prompt: 'GENERAL CUSTOM SECRET', updatedAt: '2026-01-01T00:00:00.000Z' });
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Which booking?' }] }] }) });
    vi.stubGlobal('fetch', fetch);
    await service.respond(conversation, context, 'Move my booking');
    expect(selector.select).toHaveBeenCalledOnce();
    expect(repository.getAssistantPromptOverride).not.toHaveBeenCalled();
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.input[0].content).toContain(SYSTEM_TWO_PROMPTS.booking.guidance);
    expect(body.input[0].content).not.toContain('GENERAL CUSTOM SECRET');
    expect(body.tools.map((tool: { name: string }) => tool.name)).toContain('plan_booking');
    expect(body.tools.map((tool: { name: string }) => tool.name)).toContain('send_media');
  });
  it('rejects Booking tools on the General route without executing the planner', async () => {
    const { service, planner } = setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: 'function_call', name: 'plan_booking', arguments: '{"intent":"create","bookingId":null}' }] }) }));
    expect((await service.respond(conversation, context, 'Hi')).needsHuman).toBe(true);
    expect(planner.plan).not.toHaveBeenCalled();
  });
  it.each(['failure', 'invalid'] as const)('does not start System Two after selection %s', async (kind) => {
    const { service, selector, repository } = setup();
    if (kind === 'failure') selector.select.mockRejectedValue(new Error('private provider details'));
    else selector.select.mockResolvedValue('unknown' as never);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await service.respond(conversation, context, 'Hi')).needsHuman).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(repository.getAssistantPromptOverride).not.toHaveBeenCalled();
  });
  it('checks every eligible message, and rejects oversized text before selection', async () => {
    const { service, selector } = setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'How can I help?' }] }] }) }));
    await service.respond(conversation, context, '/confirm');
    await service.respond(conversation, context, '/cancel');
    expect(selector.select).toHaveBeenCalledTimes(2);
    selector.select.mockClear();
    await service.respond(conversation, context, 'x'.repeat(4001));
    expect(selector.select).not.toHaveBeenCalled();
  });
});


it('selects anew on each turn and exposes active proposal presence without its arguments', async () => {
  const { service, selector } = setup('booking');
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Reply' }] }] }) });
  vi.stubGlobal('fetch', fetch);
  const pendingAction = { name: 'cancel_booking' as const, arguments: { bookingId: 'private-booking' }, expiresAt: '2099-01-01T00:00:00.000Z' };
  await service.respond({ ...conversation, pendingAction }, context, 'yes');
  expect(selector.select.mock.calls[0]![0].hasPendingProposal).toBe(true);
  expect(JSON.stringify(selector.select.mock.calls[0]![0])).not.toContain('private-booking');
  selector.select.mockResolvedValue('general');
  await service.respond({ ...conversation, pendingAction: { ...pendingAction, expiresAt: '2000-01-01T00:00:00.000Z' } }, context, 'Where are you located?');
  expect(selector.select).toHaveBeenCalledTimes(2);
  expect(selector.select.mock.calls[1]![0].hasPendingProposal).toBe(false);
  expect(JSON.parse(fetch.mock.calls[0]![1].body).input[0].content).toContain(SYSTEM_TWO_PROMPTS.booking.guidance);
  expect(JSON.parse(fetch.mock.calls[1]![1].body).input[0].content).toContain('SYSTEM TWO: GENERAL');
});


const naturalProposal = { id: '2a1c75d0-d891-4e04-8b54-341cba762ae6', name: 'cancel_booking' as const, arguments: { bookingId: 'booking-1' }, expiresAt: '2099-01-01T00:00:00.000Z', confirmationText: 'Cancel appointment tomorrow at 10:00?' };
describe('natural confirmation', () => {
  it('executes only after true approval and atomic consumption, without routing or probability', async () => {
    vi.stubEnv('DEFAULT_TIMEZONE', 'Europe/Kyiv');
    const { service, selector, tools, repository } = setup();
    repository.listMessages.mockResolvedValue([{ role: 'assistant', content: naturalProposal.confirmationText }]);
    selector.answerBoolean.mockResolvedValueOnce(true);
    tools.execute.mockResolvedValueOnce({ id: 'booking-1', status: 'cancelled', startAt: '2026-09-29T16:00:00.000Z', calendarSyncStatus: 'synced' });
    const reply = await service.respond({ ...conversation, pendingAction: naturalProposal }, context, 'Так, підтверджую');
    expect(reply.text).toBe('Готово. Запис booking-1: cancelled. Час: 29 вересня, вівторок, 19:00.');
    expect(repository.replacePendingAction).toHaveBeenCalledWith('chat', 'alice', naturalProposal, undefined, { requireUnexpired: true });
    expect(repository.replacePendingAction.mock.invocationCallOrder[0]).toBeLessThan(tools.execute.mock.invocationCallOrder[0]!);
    expect(tools.execute).toHaveBeenCalledWith(naturalProposal, context);
    expect(selector.select).not.toHaveBeenCalled();
    expect(selector.estimateProbability).not.toHaveBeenCalled();
  });
  it.each(['Ні, дякую', 'А скільки це коштує?', 'Так, але можна пізніше?'])('discards then handles the client message normally: %s', async (message) => {
    const { service, selector, tools, repository } = setup();
    repository.listMessages.mockResolvedValue([{ role: 'assistant', content: naturalProposal.confirmationText }, { role: 'user', content: message }]);
    selector.answerBoolean.mockResolvedValueOnce(false);
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'A reply to the current question.' }] }] }) });
    vi.stubGlobal('fetch', fetch);
    expect((await service.respond({ ...conversation, pendingAction: naturalProposal }, context, message)).text).toBe('A reply to the current question.');
    expect(selector.answerBoolean).toHaveBeenCalledOnce();
    expect(repository.replacePendingAction).toHaveBeenCalledWith('chat', 'alice', naturalProposal, undefined);
    expect(tools.execute).not.toHaveBeenCalled();
    expect(selector.select).toHaveBeenCalledOnce();
    expect(selector.select.mock.calls[0]![0]).toMatchObject({ message, hasPendingProposal: false });
    expect(repository.replacePendingAction.mock.invocationCallOrder[0]).toBeLessThan(selector.select.mock.invocationCallOrder[0]!);
    const input = JSON.parse(fetch.mock.calls[0]![1].body).input;
    expect(input[0].content).not.toContain('Previous proposal was discarded');
    expect(input[1].content).toContain('Previous proposal was discarded without execution');
    expect(input.filter((item: { role: string; content: string }) => item.role === 'user' && item.content === message)).toHaveLength(1);
    expect(input.at(-1)).toEqual({ role: 'user', content: message });
  });
  it('can stage a replacement after changed details without approving it in the same turn', async () => {
    const { service, selector, tools, repository, planner } = setup('booking');
    repository.listMessages.mockResolvedValue([{ role: 'assistant', content: naturalProposal.confirmationText }]);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'function_call', call_id: 'new-plan', name: 'plan_booking', arguments: '{"intent":"create","bookingId":null}' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Proposal prepared.' }] }] }) }));
    const result = await service.respond({ ...conversation, pendingAction: naturalProposal }, context, 'Краще зробимо новий запис на інший час');
    expect(result.text).toContain('Підтвердьте, будь ласка, якщо вам все підходить.');
    expect(selector.answerBoolean).toHaveBeenCalledOnce();
    expect(selector.select).toHaveBeenCalledOnce();
    expect(planner.plan.mock.calls[0]![0]).toMatchObject({ pendingAction: undefined });
    expect(repository.replacePendingAction).toHaveBeenCalledTimes(2);
    expect(repository.replacePendingAction.mock.calls[1]![2]).toBeUndefined();
    expect(repository.replacePendingAction.mock.calls[1]![3]).toMatchObject({ name: 'create_booking', confirmationText: result.text });
    expect(repository.replacePendingAction.mock.calls[1]![3].id).not.toBe(naturalProposal.id);
    expect(tools.execute).not.toHaveBeenCalled();
  });
  it.each(['stale', 'failed'] as const)('does not route or execute after a %s discard', async (kind) => {
    const { service, selector, tools, repository } = setup();
    repository.listMessages.mockResolvedValue([{ role: 'assistant', content: naturalProposal.confirmationText }]);
    if (kind === 'stale') repository.replacePendingAction.mockResolvedValueOnce(false);
    else repository.replacePendingAction.mockRejectedValueOnce(new Error('Discard failed'));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const result = await service.respond({ ...conversation, pendingAction: naturalProposal }, context, 'Можна інший час?');
    expect(selector.select).not.toHaveBeenCalled();
    expect(tools.execute).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(result.needsHuman === true).toBe(kind === 'failed');
  });
  it.each(['error', 'invalid', 'stale'] as const)('never executes on %s confirmation', async (kind) => {
    const { service, selector, tools, repository } = setup();
    repository.listMessages.mockResolvedValue([{ role: 'assistant', content: naturalProposal.confirmationText }]);
    if (kind === 'error') selector.answerBoolean.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    else selector.answerBoolean.mockResolvedValueOnce(kind === 'invalid' ? 'true' as never : true);
    if (kind === 'stale') repository.replacePendingAction.mockResolvedValueOnce(false);
    const result = await service.respond({ ...conversation, pendingAction: naturalProposal }, context, 'yes');
    expect(tools.execute).not.toHaveBeenCalled();
    if (kind !== 'stale') { expect(result.needsHuman).toBe(true); expect(repository.replacePendingAction).not.toHaveBeenCalled(); }
  });
  it('skips boolean checks for missing, expired and legacy proposals', async () => {
    const { service, selector, tools } = setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Which appointment?' }] }] }) }));
    await service.respond(conversation, context, 'yes');
    await service.respond({ ...conversation, pendingAction: { ...naturalProposal, expiresAt: '2000-01-01T00:00:00.000Z' } }, context, 'yes');
    await service.respond({ ...conversation, pendingAction: { ...naturalProposal, confirmationText: undefined } }, context, 'yes');
    expect(selector.answerBoolean).not.toHaveBeenCalled();
    expect(tools.execute).not.toHaveBeenCalled();
  });
  it('keeps a consumed action consumed when execution fails', async () => {
    const { service, selector, tools, repository } = setup();
    repository.listMessages.mockResolvedValue([{ role: 'assistant', content: naturalProposal.confirmationText }]);
    selector.answerBoolean.mockResolvedValueOnce(true);
    tools.execute.mockRejectedValueOnce(new Error('uncertain'));
    expect((await service.respond({ ...conversation, pendingAction: naturalProposal }, context, 'yes')).needsHuman).toBe(true);
    expect(repository.replacePendingAction).toHaveBeenCalledOnce();
    expect(repository.replacePendingAction.mock.calls[0]![3]).toBeUndefined();
  });
});
