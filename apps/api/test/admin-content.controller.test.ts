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
    getAdminAccessOverride: vi.fn(async () => ({ emails: ['partner@example.com'], updatedAt: '2026-09-24T10:00:00.000Z' })),
    saveAdminAccessOverride: vi.fn(async (emails: string[]) => ({ emails, updatedAt: '2026-09-24T10:00:00.000Z' })),
    getBotSettingsOverride: vi.fn(async () => undefined),
    saveBotSettingsOverride: vi.fn(async (settings: { maxReadDelayMs: number; typingDelayPerSymbolMs: number }) => ({ ...settings, updatedAt: '2026-09-24T10:00:00.000Z' })),
    getAssistantPromptOverride: vi.fn(async () => undefined),
    saveAssistantPromptOverride: vi.fn(async (prompt: string) => ({ prompt, updatedAt: '2026-09-24T10:00:00.000Z' })),
    deleteAssistantPromptOverride: vi.fn(async () => undefined),
    getKnowledgeBaseOverride: vi.fn(async () => undefined),
    saveKnowledgeBaseOverride: vi.fn(async (content: string) => ({ content, updatedAt: '2026-09-24T10:00:00.000Z' })),
    deleteKnowledgeBaseOverride: vi.fn(async () => undefined),
    listServices: vi.fn(async () => [{ id: 'massage-60', name: 'Relax', description: 'Relaxing massage', durationMinutes: 60, price: 1500, currency: 'UAH', enabled: true }]),
  };
  const specService = { getSpec: vi.fn(async () => ({ content: '# Test spec' })) };
  const servicePhotos = { upload: vi.fn(), delete: vi.fn() };
  const controller = new AdminController(repository as unknown as BookingRepository, {} as BookingService, {} as AvailabilityService, specService as unknown as SpecService, servicePhotos as unknown as ServicePhotoService);
  return { controller, repository, specService };
};

describe('admin content endpoints', () => {
  it('serves the packaged spec', async () => {
    const { controller, specService } = setup();
    await expect(controller.spec()).resolves.toEqual({ content: '# Test spec' });
    expect(specService.getSpec).toHaveBeenCalledOnce();
  });

  it('returns the code default, saves an override, and resets to the default', async () => {
    const { controller, repository } = setup();
    expect(await controller.assistantPrompt()).toEqual({ prompt: ASSISTANT_SYSTEM_PROMPT, isCustom: false });
    expect(await controller.updateAssistantPrompt({ prompt: 'Keep replies brief.' })).toEqual({ prompt: 'Keep replies brief.', isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' });
    expect(repository.saveAssistantPromptOverride).toHaveBeenCalledWith('Keep replies brief.');
    expect(await controller.resetAssistantPrompt()).toEqual({ prompt: ASSISTANT_SYSTEM_PROMPT, isCustom: false });
    expect(repository.deleteAssistantPromptOverride).toHaveBeenCalledOnce();
  });

  it('rejects blank prompt saves', async () => {
    const { controller, repository } = setup();
    await expect(controller.updateAssistantPrompt({ prompt: '  ' })).rejects.toThrow();
    expect(repository.saveAssistantPromptOverride).not.toHaveBeenCalled();
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
