import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiService, assistantToolDefinitions } from '../src/openai.service.js';
import { TELEGRAM_FORMAT_GUIDANCE, THERAPIST_FIRST_PERSON_GUIDANCE } from '../src/assistant-prompt.js';
const conversation = { telegramChatId: 'chat', clientId: 'alice', openaiConversationId: 'conv-existing', assistantEnabled: true, state: 'active', summary: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const context = { clientId: 'alice', telegramChatId: 'chat' };
const setup = () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  const repository = { listMessages: vi.fn(async () => []), getPromptOverride: vi.fn(async () => undefined), getKnowledgeBaseOverride: vi.fn(async () => undefined), listServices: vi.fn(async () => []), replacePendingAction: vi.fn(), replaceOpenAiConversation: vi.fn(), ensureOpenAiConversation: vi.fn(async () => 'conv-created'), appendMessage: vi.fn() };
  const tools = { execute: vi.fn(async (): Promise<unknown> => []) };
  const debug = { record: vi.fn(async () => {}) };
  return { repository, tools, debug, service: new OpenAiService(repository as never, tools as never, debug as never) };
};
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const answer = (text: string) => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }) });
describe('Unified OpenAI conversation', () => {
  it('accepts a completed response with null incomplete details', async () => {
    const { service } = setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'completed', incomplete_details: null, output: [{ type: 'message', content: [{ type: 'output_text', text: 'Яку послугу бажаєте?' }] }] }) }));
    expect(await service.respond(conversation, context, 'Хочу записатися')).toEqual({ text: 'Яку послугу бажаєте?', fromOpenAI: true });
  });
  it('reserves reasoning headroom and safely rejects incomplete Booking output', async () => {
    const { service, tools, repository } = setup();
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
    const { service, repository } = setup();
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
  it('allows natural booking wording when all proposal facts are preserved', async () => {
    const { service, tools } = setup();
    const facts = { serviceName: 'Massage', durationMinutes: 60, localDate: '30 вер. 2026 р.', localTime: '20:00', price: 1500, currency: 'UAH' };
    tools.execute.mockResolvedValueOnce({ status: 'prepared', proposalId: '2a1c75d0-d891-4e04-8b54-341cba762ae6', confirmationFacts: facts, expiresAt: '2099-01-01T00:00:00.000Z' });
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'function_call', name: 'prepare_booking', arguments: '{"serviceId":"massage","durationMinutes":60,"startAt":"2026-09-30T17:00:00.000Z"}', call_id: 'prepare-1' }] }) })
      .mockResolvedValueOnce(answer('Запишу вас на Massage: 60 хвилин, 30 вер. 2026 року о 20:00, вартість 1500 UAH. Підійде?'));
    vi.stubGlobal('fetch', fetch);
    const reply = await service.respond(conversation, context, 'Запиши мене');
    expect(reply).toEqual({ text: 'Запишу вас на Massage: 60 хвилин, 30 вер. 2026 року о 20:00, вартість 1500 UAH. Підійде?', fromOpenAI: true, bookingProposalId: '2a1c75d0-d891-4e04-8b54-341cba762ae6' });
    const followup = JSON.parse(fetch.mock.calls[1]![1]!.body as string);
    expect(JSON.stringify(followup.input)).not.toContain('2a1c75d0-d891-4e04-8b54-341cba762ae6');
  });
  it('withholds a booking proposal draft that omits or changes required facts', async () => {
    const { service, tools } = setup();
    const facts = { serviceName: 'Massage', durationMinutes: 60, localDate: '30 вер. 2026 р.', localTime: '20:00', price: 1500, currency: 'UAH' };
    tools.execute.mockResolvedValueOnce({ status: 'prepared', proposalId: '2a1c75d0-d891-4e04-8b54-341cba762ae6', confirmationFacts: facts, expiresAt: '2099-01-01T00:00:00.000Z' });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'function_call', name: 'prepare_booking', arguments: '{"serviceId":"massage","durationMinutes":60,"startAt":"2026-09-30T17:00:00.000Z"}', call_id: 'prepare-1' }] }) })
      .mockResolvedValueOnce(answer('Запишу вас на Massage на годину, 30 вересня о 20:00 за 1400 гривень.')));
    expect(await service.respond(conversation, context, 'Запиши мене')).toMatchObject({ text: '', needsHuman: true });
  });
  it('returns catalog facts without automatic Telegram card delivery', async () => {
    const { service, tools } = setup();
    const services = [{ id: 'massage', name: 'Massage', description: 'Relaxing massage', durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH', enabled: true, photoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/massage.jpg?token=x' }];
    tools.execute.mockResolvedValueOnce(services);
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'function_call', call_id: 'c1', name: 'get_services', arguments: '{}' }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Here are the services.' }] }] }) });
    vi.stubGlobal('fetch', fetch);
    expect(await service.respond(conversation, context, 'What services do you have?')).toEqual({ text: 'Here are the services.', fromOpenAI: true });
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
});

it('lets the model write availability and confirmation wording after reading evidence', async () => {
  const { service, tools, repository } = setup();
  tools.execute.mockResolvedValue({ schedule: { status: 'ready', messages: [{ text: 'Tomorrow 10:00' }] }, calendar: { status: 'ready', busy: [] } });
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'function_call', name: 'get_booking_context', arguments: '{}', call_id: 'call-1' }] }) }).mockResolvedValueOnce(answer('Можу запропонувати завтра о 10:00. Вам підходить?'));
  vi.stubGlobal('fetch', fetcher);
  expect(await service.respond(conversation, context, 'Є час завтра?')).toEqual({ text: 'Можу запропонувати завтра о 10:00. Вам підходить?', fromOpenAI: true });
  expect(tools.execute).toHaveBeenCalledWith({ name: 'get_booking_context', arguments: {} }, context);
  expect(repository.replacePendingAction).not.toHaveBeenCalled();
  expect(JSON.parse(fetcher.mock.calls[1]![1].body).input[0]).toMatchObject({ type: 'function_call_output', call_id: 'call-1', output: expect.stringContaining('Tomorrow 10:00') });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('uses the model create_booking call as semantic approval without a phrase whitelist', async () => {
  const { service, tools } = setup();
  tools.execute.mockResolvedValueOnce({ status: 'created', booking: { id: 'booking-1' } });
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'function_call', name: 'create_booking', arguments: '{}', call_id: 'create-1' }] }) })
    .mockResolvedValueOnce(answer('Запис підтверджено.')));
  expect(await service.respond(conversation, context, 'Цей час мені чудово підходить, можете мене записати')).toEqual({ text: 'Запис підтверджено.', fromOpenAI: true });
  expect(tools.execute).toHaveBeenCalledWith({ name: 'create_booking', arguments: {} }, context);
});

it('does not create a booking when the model replies without calling create_booking', async () => {
  const { service, tools } = setup();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer('Звісно, уточню ціну перед записом.')));
  expect(await service.respond(conversation, context, 'Так, але спершу хочу уточнити ціну')).toEqual({ text: 'Звісно, уточню ціну перед записом.', fromOpenAI: true });
  expect(tools.execute).not.toHaveBeenCalled();
});

it('ignores legacy pending actions even on explicit approval', async () => {
  const { service, tools, repository } = setup();
  const fetcher = vi.fn().mockResolvedValue(answer('Дякую.'));
  vi.stubGlobal('fetch', fetcher);
  const pendingAction = { id: 'old', name: 'create_booking' as const, arguments: { serviceId: 'massage' }, confirmationText: 'Approve?', expiresAt: '2099-01-01T00:00:00.000Z' };
  expect(await service.respond({ ...conversation, pendingAction }, context, 'Так, підтверджую')).toEqual({ text: 'Дякую.', fromOpenAI: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(tools.execute).not.toHaveBeenCalled();
  expect(repository.replacePendingAction).not.toHaveBeenCalled();
});

it.each(['cancel_booking', 'reschedule_booking', 'plan_booking'])('rejects removed tool %s without executing it', async (name) => {
  const { service, tools } = setup();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'function_call', name, arguments: '{}', call_id: 'bad' }] }) }));
  expect(await service.respond(conversation, context, 'Запиши мене')).toMatchObject({ needsHuman: true, text: '' });
  expect(tools.execute).not.toHaveBeenCalled();
  expect(assistantToolDefinitions.map(({ name }) => name)).toEqual(['get_media', 'send_media', 'get_services', 'get_bookings', 'get_booking_context', 'prepare_booking', 'create_booking', 'request_human_assistance']);
});

it('hands an unlisted custom-service request to a person without an automatic reply', async () => {
  const { service, tools } = setup();
  tools.execute.mockResolvedValue({ status: 'human_requested' });
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'function_call', name: 'request_human_assistance', arguments: '{}', call_id: 'human-1' }] }) })
    .mockResolvedValueOnce(answer('This draft must not be delivered'));
  vi.stubGlobal('fetch', fetcher);
  const reply = await service.respond(conversation, context, 'Do you offer custom hot stone massage?');
  expect(reply).toMatchObject({ text: '', needsHuman: true, humanContext: expect.stringContaining('custom service') });
  expect(tools.execute).toHaveBeenCalledWith({ name: 'request_human_assistance', arguments: {} }, { ...context, currentMessage: 'Do you offer custom hot stone massage?' });
  expect(JSON.parse(fetcher.mock.calls[1]![1].body).input).toContainEqual({ type: 'function_call_output', call_id: 'human-1', output: JSON.stringify({ status: 'human_requested' }) });
});

it('includes safe tool API failure details in the human handoff', async () => {
  const { service, tools } = setup();
  tools.execute.mockRejectedValue(Object.assign(new Error('Calendar HTTP 503 token=hidden'), { upstreamStatus: 503, code: 'UNAVAILABLE' }));
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'function_call', name: 'get_booking_context', arguments: '{}', call_id: 'context-1' }] }) })
    .mockResolvedValueOnce(answer('Do not send')));
  const reply = await service.respond(conversation, context, 'Is 10:00 free?');
  expect(reply).toMatchObject({ text: '', needsHuman: true });
  expect(reply.humanContext).toContain('Не вдалося прочитати розклад і календар');
  expect(reply.humanContext).toContain('HTTP 503');
  expect(reply.humanContext).toContain('Код помилки: UNAVAILABLE');
  expect(reply.humanContext).not.toContain('hidden');
});

it('preserves a failed media API result for the human case', async () => {
  const { service, tools } = setup();
  tools.execute.mockResolvedValue({ status: 'failed', errorContext: 'Не вдалося надіслати медіа клієнту. Зовнішній сервіс повернув статус HTTP 503. ID запиту: req_123. Перевірте стан операції перед повторною спробою.' });
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'function_call', name: 'send_media', arguments: '{"mediaId":"media-1"}', call_id: 'media-1' }] }) })
    .mockResolvedValueOnce(answer('Do not send')));
  const reply = await service.respond(conversation, context, 'Send me a photo');
  expect(reply).toMatchObject({ text: '', needsHuman: true });
  expect(reply.humanContext).toContain('HTTP 503');
  expect(reply.humanContext).toContain('ID запиту: req_123');
});

it.each(['', 'x'.repeat(4001)])('fails closed on empty/oversized output without local messages', async (text) => {
  const { service } = setup();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(text)));
  expect(await service.respond(conversation, context, 'Hi')).toMatchObject({ needsHuman: true, text: '' });
});

it('uses the unified override for every turn and keeps full knowledge and catalog', async () => {
  const { service, repository } = setup();
  repository.getPromptOverride.mockResolvedValue({ prompt: 'Unified custom style' } as never);
  repository.getKnowledgeBaseOverride.mockResolvedValue({ content: 'Unrelated policy still retained. Eligibility matters.' } as never);
  repository.listServices.mockResolvedValue([{ id: 'massage', name: 'Massage', enabled: true, durationMinutes: 60, bufferMinutes: 30, price: 1500, currency: 'UAH' }] as never);
  const fetcher = vi.fn().mockResolvedValue(answer('Вітаю.'));
  vi.stubGlobal('fetch', fetcher);
  await service.respond(conversation, context, 'Hi');
  expect(repository.getPromptOverride).toHaveBeenCalledWith('assistant');
  const body = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(JSON.stringify(body.input[0])).toContain('Unified custom style');
  expect(JSON.stringify(body.input[0])).toContain('create_booking');
  expect(body.input[1].content).toContain('Unrelated policy still retained');
  expect(body.input[1].content).toContain('bufferMinutes');
});
