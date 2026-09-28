import { describe, expect, it, vi } from 'vitest';
import { AdminController } from '../src/controllers.js';
import { ASSISTANT_SYSTEM_PROMPT } from '../src/assistant-prompt.js';
import { DEFAULT_KNOWLEDGE_BASE } from '../src/default-knowledge-base.js';
import type { AvailabilityService } from '../src/availability.service.js';
import type { BookingService } from '../src/booking.service.js';
import type { BookingRepository } from '../src/repository.js';
import type { SpecService } from '../src/spec.service.js';
import type { ServicePhotoService } from '../src/service-photo.service.js';

const setup = () => {
  const repository = {
    getSystemOneSettings: vi.fn(async () => ({ provider: 'openai' })),
    saveSystemOneSettings: vi.fn(async (settings: { provider: string }) => settings),
    getAdminAccessOverride: vi.fn(async () => ({ emails: ['partner@example.com'], updatedAt: '2026-09-24T10:00:00.000Z' })),
    saveAdminAccessOverride: vi.fn(async (emails: string[]) => ({ emails, updatedAt: '2026-09-24T10:00:00.000Z' })),
    getBotSettingsOverride: vi.fn(async () => undefined),
    saveBotSettingsOverride: vi.fn(async (settings: { maxReadDelayMs: number; typingDelayPerSymbolMs: number }) => ({ ...settings, updatedAt: '2026-09-24T10:00:00.000Z' })),
    getPromptOverride: vi.fn(async () => undefined as { prompt: string; updatedAt: string } | undefined),
    savePromptOverride: vi.fn(async (_id: string, prompt: string) => ({ prompt, updatedAt: '2026-09-24T10:00:00.000Z' })),
    deletePromptOverride: vi.fn(async () => undefined),
    getKnowledgeBaseOverride: vi.fn(async () => undefined),
    saveKnowledgeBaseOverride: vi.fn(async (content: string) => ({ content, updatedAt: '2026-09-24T10:00:00.000Z' })),
    deleteKnowledgeBaseOverride: vi.fn(async () => undefined),
    listServices: vi.fn(async () => [{ id: 'massage-60', name: 'Relax', description: 'Relaxing massage', durationMinutes: 60, price: 1500, currency: 'UAH', enabled: true }]),
    clearConversationContext: vi.fn(async (_chatId: string) => ({ clearedMessages: 3 } as { clearedMessages: number } | undefined)),
  };
  const specService = { getSpec: vi.fn(async () => ({ content: '# Test spec' })) };
  const servicePhotos = { upload: vi.fn(), delete: vi.fn() };
  const controller = new AdminController(repository as unknown as BookingRepository, {} as BookingService, {} as AvailabilityService, specService as unknown as SpecService, servicePhotos as unknown as ServicePhotoService);
  return { controller, repository, specService };
};

describe('admin content endpoints', () => {
  it('clears only the requested existing conversation context', async () => {
    const { controller, repository } = setup();
    await expect(controller.clearConversationContext('chat-1')).resolves.toEqual({ clearedMessages: 3 });
    expect(repository.clearConversationContext).toHaveBeenCalledWith('chat-1');
    repository.clearConversationContext.mockResolvedValueOnce(undefined);
    await expect(controller.clearConversationContext('missing')).rejects.toThrow('Conversation not found');
  });
  it('serves code-owned instructions grouped by system', () => {
    const { controller } = setup();
    const catalog = controller.promptCatalog();
    expect(catalog.systemOne.map(({ id }) => id)).toEqual(['handoff']);
    expect(catalog.systemTwo.map(({ id }) => id)).toEqual(['assistant']);
    expect(catalog.systemOne[0]?.content).toContain('look like a bot response');
  });
  it('serves the packaged spec', async () => {
    const { controller, specService } = setup();
    await expect(controller.spec()).resolves.toEqual({ content: '# Test spec' });
    expect(specService.getSpec).toHaveBeenCalledOnce();
  });
  it('saves and resets each newly editable prompt independently', async () => {
    const { controller, repository } = setup();
    for (const id of ['handoff', 'assistant'] as const) {
      const initial = await controller.promptById(id);
      expect(initial.isCustom).toBe(false);
      expect(initial.prompt.length).toBeGreaterThan(0);
      expect(await controller.updatePromptById(id, { prompt: `Custom ${id}` })).toMatchObject({ prompt: `Custom ${id}`, isCustom: true });
      expect(repository.savePromptOverride).toHaveBeenLastCalledWith(id, `Custom ${id}`);
      expect(await controller.resetPromptById(id)).toEqual(initial);
      expect(repository.deletePromptOverride).toHaveBeenLastCalledWith(id);
    }
    for (const id of ['routing', 'approval', 'probability', 'general', 'booking-conversation', 'booking-planner']) await expect(controller.promptById(id)).rejects.toThrow();
    await expect(controller.updatePromptById('assistant', { prompt: ' ' })).rejects.toThrow();
    expect((await controller.promptById('assistant')).prompt).toBe(ASSISTANT_SYSTEM_PROMPT);
  });

  it('serves an editable knowledge base with live service facts and resets it independently', async () => {
    const { controller, repository } = setup();
    const service = { id: 'massage-60', name: 'Relax', description: 'Relaxing massage', durationMinutes: 60, price: 1500, currency: 'UAH' };
    expect(await controller.knowledgeBase()).toEqual({ content: DEFAULT_KNOWLEDGE_BASE, isCustom: false, services: [service] });
    expect(await controller.updateKnowledgeBase({ content: 'Parking is available.' })).toEqual({ content: 'Parking is available.', isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z', services: [service] });
    expect(repository.saveKnowledgeBaseOverride).toHaveBeenCalledWith('Parking is available.');
    expect(await controller.resetKnowledgeBase()).toEqual({ content: DEFAULT_KNOWLEDGE_BASE, isCustom: false, services: [service] });
    expect(repository.deleteKnowledgeBaseOverride).toHaveBeenCalledOnce();
  });

  it('rejects blank knowledge base content before persistence', async () => {
    const { controller, repository } = setup();
    await expect(controller.updateKnowledgeBase({ content: '  ' })).rejects.toThrow();
    expect(repository.saveKnowledgeBaseOverride).not.toHaveBeenCalled();
  });

  it('returns default bot settings and saves valid overrides', async () => {
    const { controller, repository } = setup();
    expect(await controller.botSettings()).toEqual({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, isCustom: false });
    expect(await controller.updateBotSettings({ maxReadDelayMs: 750, typingDelayPerSymbolMs: 400 })).toEqual({ maxReadDelayMs: 750, typingDelayPerSymbolMs: 400, isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' });
    expect(repository.saveBotSettingsOverride).toHaveBeenCalledWith({ maxReadDelayMs: 750, typingDelayPerSymbolMs: 400 });
    await controller.updateBotSettings({ maxReadDelayMs: 3_540_000, typingDelayPerSymbolMs: 400 });
    expect(repository.saveBotSettingsOverride).toHaveBeenLastCalledWith({ maxReadDelayMs: 3_540_000, typingDelayPerSymbolMs: 400 });
  });

  it('rejects bot settings outside documented limits', async () => {
    const { controller, repository } = setup();
    await expect(controller.updateBotSettings({ maxReadDelayMs: 3_540_001, typingDelayPerSymbolMs: 600 })).rejects.toThrow();
    await expect(controller.updateBotSettings({ maxReadDelayMs: 1000, typingDelayPerSymbolMs: 800.5 })).rejects.toThrow();
    expect(repository.saveBotSettingsOverride).not.toHaveBeenCalled();
  });

  it('returns and saves the stakeholder email allowlist', async () => {
    const { controller, repository } = setup();
    expect(await controller.adminAccess({ admin: { uid: 'owner', isOwner: true } })).toEqual({ emails: ['partner@example.com'], canManage: true, updatedAt: '2026-09-24T10:00:00.000Z' });
    expect(await controller.updateAdminAccess({ emails: [' Partner@Example.com ', 'second@example.com'] })).toEqual({ emails: ['partner@example.com', 'second@example.com'], canManage: true, updatedAt: '2026-09-24T10:00:00.000Z' });
    expect(repository.saveAdminAccessOverride).toHaveBeenCalledWith(['partner@example.com', 'second@example.com']);
    expect(await controller.adminAccess({ admin: { uid: 'stakeholder', isOwner: false } })).toEqual({ emails: ['partner@example.com'], canManage: false, updatedAt: '2026-09-24T10:00:00.000Z' });
  });

  it('rejects invalid stakeholder access lists before persistence', async () => {
    const { controller, repository } = setup();
    await expect(controller.updateAdminAccess({ emails: ['bad-email'] })).rejects.toThrow();
    await expect(controller.updateAdminAccess({ emails: ['x@example.com', 'X@example.com'] })).rejects.toThrow();
    expect(repository.saveAdminAccessOverride).not.toHaveBeenCalled();
  });
});

it('reads and saves validated System One selection without credentials', async () => {
  const { controller, repository } = setup();
  expect(await controller.systemOneSettings()).toEqual({ provider: 'openai' });
  expect(await controller.updateSystemOneSettings({ provider: 'typesafe' })).toEqual({ provider: 'typesafe' });
  expect(repository.saveSystemOneSettings).toHaveBeenCalledWith({ provider: 'typesafe' });
  await expect(controller.updateSystemOneSettings({ provider: 'invalid' })).rejects.toThrow();
  await expect(controller.updateSystemOneSettings({ provider: 'openai', token: 'secret' })).rejects.toThrow();
  expect(repository.saveSystemOneSettings).toHaveBeenCalledTimes(1);
});
