import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiService } from '../src/openai.service.js';
import type { AssistantToolsService } from '../src/assistant-tools.service.js';
import type { BookingRepository } from '../src/repository.js';
const conversation = { telegramChatId: 'chat', clientId: 'alice', assistantEnabled: true, state: 'active', summary: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const context = { clientId: 'alice', telegramChatId: 'chat' };
const setup = () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  const repository = { listMessages: vi.fn(async () => []), getAssistantPromptOverride: vi.fn(async () => undefined), saveConversation: vi.fn(async (value: typeof conversation & { pendingAction?: unknown }) => value), appendMessage: vi.fn() };
  const tools = { execute: vi.fn(async (): Promise<unknown> => ({ id: 'booking-1', startAt: '2099-01-01T10:00:00.000Z', status: 'confirmed' })) };
  const service = new OpenAiService(repository as unknown as BookingRepository, tools as unknown as AssistantToolsService);
  return { repository, tools, service };
};
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('OpenAI conversation', () => {
  it('continues function calls and returns the model reply', async () => {
    const { service, tools } = setup();
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'function_call', call_id: 'c1', name: 'get_services', arguments: '{}' }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Вітаю!' }] }] }) });
    vi.stubGlobal('fetch', fetch);
    expect(await service.respond(conversation, context, 'Привіт')).toEqual({ text: 'Вітаю!', fromOpenAI: true });
    expect(tools.execute).toHaveBeenCalledWith({ name: 'get_services', arguments: {} }, context);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('includes enabled services for Telegram card delivery when get_services is used', async () => {
    const { service, tools } = setup();
    const services = [{ id: 'massage', name: 'Massage', description: 'Relaxing massage', durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH', enabled: true, photoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/massage.jpg?token=x' }];
    tools.execute.mockResolvedValueOnce(services);
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'function_call', call_id: 'c1', name: 'get_services', arguments: '{}' }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Here are the services.' }] }] }) });
    vi.stubGlobal('fetch', fetch);
    expect(await service.respond(conversation, context, 'What services do you have?')).toEqual({ text: 'Here are the services.', fromOpenAI: true, serviceCards: services });
  });
  it('uses the current stored prompt override for the next assistant request', async () => {
    const { service, repository } = setup();
    repository.getAssistantPromptOverride.mockResolvedValue({ prompt: 'Speak only in short sentences.', updatedAt: '2026-09-24T10:00:00.000Z' });
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello.' }] }] }) }));
    vi.stubGlobal('fetch', fetch);
    await service.respond(conversation, context, 'Hi');
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string).instructions).toContain('Speak only in short sentences.');
  });
  it('stages mutation without executing and consumes it only on explicit confirmation', async () => {
    const { service, tools, repository } = setup();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ output: [{ type: 'function_call', call_id: 'c1', name: 'create_booking', arguments: JSON.stringify({ serviceId: 'massage', startAt: '2099-01-01T10:00:00.000Z' }) }] }) })));
    expect((await service.respond(conversation, context, 'Запиши мене')).text).toContain('/confirm');
    expect(tools.execute).not.toHaveBeenCalled();
    const saved = repository.saveConversation.mock.calls[0]![0];
    expect((await service.respond(saved, context, '/confirm')).text).toContain('booking-1');
    expect(tools.execute).toHaveBeenCalledOnce();
    expect(repository.saveConversation.mock.calls[1]![0].pendingAction).toBeUndefined();
  });
  it('does not execute expired pending actions', async () => {
    const { service, tools } = setup();
    await service.respond({ ...conversation, pendingAction: { name: 'cancel_booking', arguments: { bookingId: 'b' }, expiresAt: '2020-01-01T00:00:00.000Z' } }, context, '/confirm');
    expect(tools.execute).not.toHaveBeenCalled();
  });
  it('returns a safe fallback when the provider fails', async () => {
    const { service } = setup();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 })));
    expect((await service.respond(conversation, context, 'Привіт')).text).toContain('Спробуйте');
  });
});
