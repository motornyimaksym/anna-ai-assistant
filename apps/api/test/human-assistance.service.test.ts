import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookingRepository } from '../src/repository.js';
import type { HumanAssistanceStore } from '../src/human-assistance.store.js';
import { HumanAssistanceService, needsHuman } from '../src/human-assistance.service.js';
import { DEFAULT_KNOWLEDGE_BASE } from '../src/default-knowledge-base.js';
import type { ConversationDto } from '@booking/contracts';

const conversation: ConversationDto = { telegramChatId: '123', assistantEnabled: true, state: 'active', summary: '', createdAt: '2026-09-25T10:00:00.000Z', updatedAt: '2026-09-25T10:00:00.000Z' };
const setup = (thresholdPercent = 60) => {
  const store = { settings: vi.fn(async () => ({ thresholdPercent, usernames: [] })), connected: vi.fn(async () => []), open: vi.fn(), setDelivery: vi.fn(), get: vi.fn(), claimAnswer: vi.fn(), completeAnswer: vi.fn() };
  const repository = { getKnowledgeBaseOverride: vi.fn(async () => ({ content: 'Open 10:00–20:00', updatedAt: conversation.updatedAt })), listServices: vi.fn(async () => [{ id: 'massage-60', name: 'Massage', description: 'Classic', durationMinutes: 60, price: 1500, currency: 'UAH', enabled: true }]), listMessages: vi.fn(async () => [{ role: 'user' as const, content: 'Earlier question' }]), appendMessage: vi.fn() };
  return { service: new HumanAssistanceService(store as unknown as HumanAssistanceStore, repository as unknown as BookingRepository), store, repository };
};
const request = { id: 'case-1', conversationId: '123', telegramChatId: '123', telegramUpdateId: 1, businessConnectionId: 'business-1', status: 'open', reason: 'knowledge_gap', probability: 0.7, thresholdPercent: 60, question: 'Unknown?', queuedMessages: [], notifications: {}, acknowledgement: 'sent', createdAt: conversation.createdAt, updatedAt: conversation.updatedAt } as const;
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Jev decision', () => {
  it('uses inclusive probability threshold', () => {
    expect(needsHuman(0.5, 60)).toBe(false);
    expect(needsHuman(0.6, 60)).toBe(true);
    expect(needsHuman(0, 0)).toBe(true);
    expect(needsHuman(0.999, 100)).toBe(false);
    expect(needsHuman(1, 100)).toBe(true);
  });
  it('sends current question, knowledge, catalog and bearer token before OpenAI', async () => {
    vi.stubEnv('JEV_TOKEN', 'test-jev-token');
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ code: 0, data: { answers: { needs_human_assistance: { noul: 0.5 } } } }) }));
    vi.stubGlobal('fetch', fetcher);
    const { service } = setup();
    expect(await service.decide(conversation, 'What is the price?')).toEqual({ route: 'openai' });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://www.jevai.org/api/v1/decisions');
    expect(init.headers.Authorization).toBe('Bearer test-jev-token');
    const body = JSON.parse(init.body) as { state: { current_question: string; knowledge_base: string; enabled_services: Array<{ id: string }> }; questions: { needs_human_assistance: { type: string } } };
    expect(body.state.current_question).toBe('What is the price?');
    expect(body.state.knowledge_base).toBe('Open 10:00–20:00');
    expect(body.state.enabled_services[0]?.id).toBe('massage-60');
    expect(body.questions.needs_human_assistance.type).toBe('noul');
  });
  it('sends repo knowledge to Jev when no override exists', async () => {
    vi.stubEnv('JEV_TOKEN', 'test-jev-token');
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ code: 0, data: { answers: { needs_human_assistance: { noul: 0.5 } } } }) }));
    vi.stubGlobal('fetch', fetcher);
    const { service, repository } = setup();
    repository.getKnowledgeBaseOverride.mockResolvedValue(undefined);
    await service.decide(conversation, 'What is the policy?');
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).state.knowledge_base).toBe(DEFAULT_KNOWLEDGE_BASE);
  });
  it('holds valid high scores and continues with OpenAI when Jev is unavailable', async () => {
    vi.stubEnv('JEV_TOKEN', 'test-jev-token');
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ code: 0, data: { answers: { needs_human_assistance: { noul: 0.6 } } } }) }));
    vi.stubGlobal('fetch', fetcher);
    const { service } = setup();
    expect(await service.decide(conversation, 'Unknown policy?')).toEqual({ route: 'human', reason: 'knowledge_gap', probability: 0.6, thresholdPercent: 60 });
    fetcher.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ code: 0, data: { answers: { needs_human_assistance: { noul: '0.5' } } } }) }));
    expect(await service.decide(conversation, 'Unknown policy?')).toEqual({ route: 'openai' });
    fetcher.mockImplementationOnce(async () => ({ ok: false, json: async () => ({}) }));
    expect(await service.decide(conversation, 'Unknown policy?')).toEqual({ route: 'openai' });
    fetcher.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ code: 1 }) }));
    expect(await service.decide(conversation, 'Unknown policy?')).toEqual({ route: 'openai' });
    fetcher.mockImplementationOnce(async () => { throw new Error('timeout'); });
    expect(await service.decide(conversation, 'Unknown policy?')).toEqual({ route: 'openai' });
    vi.stubEnv('JEV_TOKEN', undefined);
    expect(await service.decide(conversation, 'Unknown policy?')).toEqual({ route: 'openai' });
  });
  it('continues with OpenAI when essential Jev input exceeds the body cap', async () => {
    vi.stubEnv('JEV_TOKEN', 'test-jev-token');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { service, repository } = setup();
    repository.getKnowledgeBaseOverride.mockResolvedValue({ content: 'K'.repeat(33 * 1024), updatedAt: conversation.updatedAt });
    expect(await service.decide(conversation, 'Can you answer?')).toEqual({ route: 'openai' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('human reply delivery', () => {
  it('claims once and sends through the original Business connection', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal('fetch', fetcher);
    const { service, store, repository } = setup();
    store.get.mockResolvedValue(request as never);
    store.claimAnswer.mockResolvedValue('lease-1' as never);
    store.completeAnswer.mockResolvedValue(true as never);
    await service.reply('case-1', ' Human answer ', 'telegram:42');
    expect(store.claimAnswer).toHaveBeenCalledWith('case-1', 'telegram:42');
    expect(store.completeAnswer).toHaveBeenCalledWith('case-1', 'lease-1', 'answered', 'Human answer');
    expect(repository.appendMessage).toHaveBeenCalledWith('123', 'human', 'Human answer');
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body)).toEqual({ chat_id: '123', business_connection_id: 'business-1', text: 'Human answer' });
  });
  it('keeps explicit rejection open and uncertain transport paused', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const { service, store, repository } = setup();
    store.get.mockResolvedValue(request as never);
    store.claimAnswer.mockResolvedValue('lease-1' as never);
    const fetcher = vi.fn(async () => ({ ok: false, json: async () => ({ ok: false }) }));
    vi.stubGlobal('fetch', fetcher);
    await expect(service.reply('case-1', 'Human answer', 'telegram:42')).rejects.toThrow('Telegram rejected');
    expect(store.completeAnswer).toHaveBeenCalledWith('case-1', 'lease-1', 'open');
    fetcher.mockImplementationOnce(async () => { throw new Error('timeout'); });
    await expect(service.reply('case-1', 'Human answer', 'telegram:42')).rejects.toThrow('uncertain');
    expect(store.completeAnswer).toHaveBeenLastCalledWith('case-1', 'lease-1', 'uncertain');
    expect(repository.appendMessage).not.toHaveBeenCalled();
  });
  it('sends only the winning claimed reply', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal('fetch', fetcher);
    const { service, store } = setup();
    store.get.mockResolvedValue(request as never);
    store.claimAnswer.mockResolvedValueOnce('lease-1' as never).mockResolvedValueOnce(undefined as never);
    store.completeAnswer.mockResolvedValue(true as never);
    const results = await Promise.allSettled([service.reply('case-1', 'First', 'telegram:1'), service.reply('case-1', 'Second', 'telegram:2')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
