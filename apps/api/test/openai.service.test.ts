import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiService, assistantToolDefinitions } from '../src/openai.service.js';
import { TELEGRAM_FORMAT_GUIDANCE, THERAPIST_FIRST_PERSON_GUIDANCE } from '../src/assistant-prompt.js';
const conversation = { telegramChatId: 'chat', clientId: 'alice', openaiConversationId: 'conv-existing', assistantEnabled: true, state: 'active', summary: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const context = { clientId: 'alice', telegramChatId: 'chat' };
const setup = () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  const repository = { listMessages: vi.fn(async () => []), getPromptOverride: vi.fn(async () => undefined), getKnowledgeBaseOverride: vi.fn(async () => undefined), listServices: vi.fn(async () => [{ id: 'massage', name: 'Massage', enabled: true, durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH' }]), detachOpenAiConversation: vi.fn(), replacePendingAction: vi.fn(), replaceOpenAiConversation: vi.fn(), ensureOpenAiConversation: vi.fn(async () => 'conv-created'), appendMessage: vi.fn() };
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
  it('ignores legacy provider state and sends bounded delivered history once on every turn', async () => {
    const { service, repository, tools } = setup();
    const history = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `message-${i}` }));
    repository.listMessages.mockResolvedValue(history);
    const fetcher = vi.fn().mockResolvedValue(answer('Reply'));
    vi.stubGlobal('fetch', fetcher);
    await service.respond(conversation, context, 'First');
    await service.respond(conversation, context, 'Second');
    for (const [index, call] of fetcher.mock.calls.entries()) {
      const body = JSON.parse(call[1].body);
      expect(body.conversation).toBeUndefined();
      expect(body.previous_response_id).toBeUndefined();
      expect(body.store).toBe(false);
      expect(body.input.slice(2, -1)).toEqual(history.slice(-19));
      expect(body.input.at(-1)).toEqual({ role: 'user', content: index ? 'Second' : 'First' });
      expect(body.input.filter((item: { role?: string }) => item.role === 'developer')).toHaveLength(2);
    }
    expect(repository.ensureOpenAiConversation).not.toHaveBeenCalled();
    expect(tools.execute).not.toHaveBeenCalled();
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
    expect(tools.execute).toHaveBeenCalledWith({ name: 'get_services', arguments: {} }, expect.objectContaining({ clientId: 'alice', telegramChatId: 'chat', currentMessage: expect.any(String) }));
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
    const reply = await service.respond(conversation, context, 'Запиши мене');
    expect(reply).toMatchObject({ text: '', needsHuman: true, humanContext: expect.stringContaining('Не вдалося перевірити факти пропозиції запису') });
    expect(reply.humanContext).toContain('Перевірка не пройдена: тривалість, ціна, зайве або суперечливе число.');
    expect(reply.humanContext).not.toContain('Технічний стек викликів');
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
  expect(tools.execute).toHaveBeenCalledWith({ name: 'get_booking_context', arguments: {} }, expect.objectContaining({ clientId: 'alice', telegramChatId: 'chat', currentMessage: expect.any(String) }));
  expect(repository.replacePendingAction).not.toHaveBeenCalled();
  expect(JSON.parse(fetcher.mock.calls[1]![1].body).input.at(-1)).toMatchObject({ type: 'function_call_output', call_id: 'call-1', output: expect.stringContaining('Tomorrow 10:00') });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('uses the model create_booking call as semantic approval without a phrase whitelist', async () => {
  const { service, tools } = setup();
  tools.execute.mockResolvedValueOnce({ status: 'created', booking: { id: 'booking-1' } });
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'function_call', name: 'create_booking', arguments: '{}', call_id: 'create-1' }] }) })
    .mockResolvedValueOnce(answer('Запис підтверджено.')));
  expect(await service.respond(conversation, context, 'Цей час мені чудово підходить, можете мене записати')).toEqual({ text: 'Запис підтверджено.', fromOpenAI: true });
  expect(tools.execute).toHaveBeenCalledWith({ name: 'create_booking', arguments: {} }, expect.objectContaining({ clientId: 'alice', telegramChatId: 'chat', currentMessage: expect.any(String) }));
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
  expect(reply).toMatchObject({ text: '', needsHuman: true, humanContext: expect.any(String) });
  expect(tools.execute).toHaveBeenCalledWith({ name: 'request_human_assistance', arguments: {} }, expect.objectContaining({ clientId: 'alice', telegramChatId: 'chat', currentMessage: expect.any(String) }));
  expect(fetcher).toHaveBeenCalledTimes(1);
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

it.each([false, true])('bounds invalid catalog ID correction (repeated=%s)', async (repeated) => {
  const { service, tools, repository, debug } = setup();
  const catalog = [{ id: 'actual-id', name: 'Massage', enabled: true, durationMinutes: 90, price: 4000, currency: 'UAH', bufferMinutes: 15 }];
  repository.listServices.mockResolvedValue(catalog as never);
  const failure = Object.assign(new Error('Service unavailable'), { code: 'BOOKING_SERVICE_UNAVAILABLE' });
  tools.execute.mockRejectedValueOnce(failure);
  if (repeated) tools.execute.mockRejectedValueOnce(failure);
  else tools.execute.mockResolvedValueOnce({ status: 'prepared', proposalId: '2a1c75d0-d891-4e04-8b54-341cba762ae6', confirmationFacts: { serviceName: 'Massage', durationMinutes: 90, localDate: '2 жовт. 2026 р.', localTime: '18:30', price: 4000, currency: 'UAH' }, expiresAt: '2099-01-01T00:00:00.000Z' });
  const call = (id: string) => ({ ok: true, json: async () => ({ output: [{ type: 'function_call', name: 'prepare_booking', call_id: id, arguments: JSON.stringify({ serviceId: id, durationMinutes: 90, startAt: '2099-01-01T10:00:00Z' }) }] }) });
  const fetcher = vi.fn().mockResolvedValueOnce(call('invented-id')).mockResolvedValueOnce(call('actual-id')).mockResolvedValueOnce(answer('Massage, 90 хв, 2 жовт. 2026 р. о 18:30, 4000 UAH. Підтверджуєте?'));
  vi.stubGlobal('fetch', fetcher);
  const reply = await service.respond(conversation, { ...context, traceId: 'trace' }, 'Selected time');
  const first = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(first.tools.find((t: { name: string }) => t.name === 'prepare_booking').parameters.properties.serviceId.enum).toEqual(['actual-id']);
  const correction = JSON.parse(JSON.parse(fetcher.mock.calls[1]![1].body).input.at(-1).output);
  expect(correction).toMatchObject({ status: 'correction_required', code: 'BOOKING_SERVICE_UNAVAILABLE', services: [{ id: 'actual-id' }] });
  expect(repository.listServices).toHaveBeenCalledTimes(2);
  expect(tools.execute).toHaveBeenCalledTimes(2);
  expect(debug.record).toHaveBeenCalledWith(expect.objectContaining({ traceId: 'trace' }), 'error', expect.objectContaining({ tool: 'prepare_booking', errorCategory: 'BOOKING_SERVICE_UNAVAILABLE', reason: 'catalog_correction_offered' }), 'warn');
  expect(fetcher).toHaveBeenCalledTimes(repeated ? 2 : 3);
  if (repeated) {
    expect(reply.needsHuman).toBe(true);
    expect(repository.detachOpenAiConversation).not.toHaveBeenCalled();
  } else {
    expect(reply.needsHuman).not.toBe(true);
    expect(repository.detachOpenAiConversation).not.toHaveBeenCalled();
  }
});

it('does not retry an uncertain booking write or generate an unsent final reply', async () => {
  const { service, tools, repository, debug } = setup();
  tools.execute.mockRejectedValue(Object.assign(new Error('Private client value'), { code: 'CALENDAR_UNCERTAIN' }));
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: 'function_call', name: 'create_booking', arguments: '{}', call_id: 'write' }] }) });
  vi.stubGlobal('fetch', fetcher);
  expect(await service.respond(conversation, context, 'Approve')).toMatchObject({ needsHuman: true, text: '' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(tools.execute).toHaveBeenCalledTimes(1);
  expect(repository.detachOpenAiConversation).not.toHaveBeenCalled();
  expect(debug.record).toHaveBeenCalledWith(context, 'error', expect.objectContaining({ reason: 'tool_execution_failed', tool: 'create_booking' }), 'error');
});

it.each(['empty', 'error'])('escalates without another model call when catalog recovery is %s', async (kind) => {
  const { service, tools, repository, debug } = setup();
  if (kind === 'empty') repository.listServices.mockResolvedValueOnce([{ id: 'massage', name: 'Massage', enabled: true, durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH' }]).mockResolvedValueOnce([]);
  else repository.listServices.mockResolvedValueOnce([{ id: 'massage', name: 'Massage', enabled: true, durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH' }]).mockRejectedValueOnce(new Error('Catalog unavailable'));
  tools.execute.mockRejectedValue(Object.assign(new Error('Service unavailable'), { code: 'BOOKING_SERVICE_UNAVAILABLE' }));
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: 'function_call', name: 'prepare_booking', call_id: 'c1', arguments: JSON.stringify({ serviceId: 'missing', durationMinutes: 90, startAt: '2099-01-01T10:00:00Z' }) }] }) });
  vi.stubGlobal('fetch', fetcher);
  expect(await service.respond(conversation, context, 'Selected time')).toMatchObject({ needsHuman: true, text: '' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(tools.execute).toHaveBeenCalledTimes(1);
  expect(repository.detachOpenAiConversation).not.toHaveBeenCalled();
  if (kind === 'error') expect(debug.record).toHaveBeenCalledWith(context, 'error', expect.objectContaining({ reason: 'catalog_refresh_failed' }), 'error');
});

it('does not offer preparation with an empty or disabled catalog', async () => {
  const { service, repository } = setup();
  repository.listServices.mockResolvedValue([{ id: 'disabled', name: 'Massage', enabled: false, durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH' }]);
  const fetcher = vi.fn().mockResolvedValue(answer('Reply'));
  vi.stubGlobal('fetch', fetcher);
  await service.respond(conversation, context, 'Hi');
  const body = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(body.tools.map((tool: { name: string }) => tool.name)).not.toContain('prepare_booking');
});

it('preserves every output item through multiple stateless tool rounds without duplicating context', async () => {
  const { service, tools } = setup();
  const reasoning = { type: 'reasoning', id: 'rs_1', summary: [], content: null, encrypted_content: 'opaque-encrypted-data' };
  const firstCall = { type: 'function_call', name: 'get_services', call_id: 'first', arguments: '{}' };
  const secondCall = { type: 'function_call', name: 'get_booking_context', call_id: 'second', arguments: '{}' };
  tools.execute.mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({ schedule: { status: 'ready' } });
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ output: [reasoning, firstCall] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [secondCall] }) }).mockResolvedValueOnce(answer('Reply'));
  vi.stubGlobal('fetch', fetcher);
  expect((await service.respond(conversation, context, 'Current message')).needsHuman).not.toBe(true);
  const requests = fetcher.mock.calls.map(call => JSON.parse(call[1].body));
  const initial = requests[0].input;
  expect(requests[1].input).toEqual([...initial, reasoning, firstCall, { type: 'function_call_output', call_id: 'first', output: JSON.stringify({ items: [] }) }]);
  expect(requests[2].input).toEqual([...requests[1].input, secondCall, { type: 'function_call_output', call_id: 'second', output: JSON.stringify({ schedule: { status: 'ready' } }) }]);
  for (const request of requests) {
    expect(request.store).toBe(false);
    expect(request.conversation).toBeUndefined();
    expect(request.input.filter((item: { role?: string }) => item.role === 'developer')).toHaveLength(2);
  }
  expect(tools.execute).toHaveBeenCalledTimes(2);
});
