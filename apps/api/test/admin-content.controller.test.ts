import { describe, expect, it, vi } from 'vitest';
import { AdminController } from '../src/controllers.js';
import { ASSISTANT_SYSTEM_PROMPT } from '../src/assistant-prompt.js';
import type { AvailabilityService } from '../src/availability.service.js';
import type { BookingService } from '../src/booking.service.js';
import type { BookingRepository } from '../src/repository.js';
import type { SpecService } from '../src/spec.service.js';

const setup = () => {
  const repository = {
    getBotSettingsOverride: vi.fn(async () => undefined),
    saveBotSettingsOverride: vi.fn(async (settings: { maxReadDelayMs: number; typingDelayPerSymbolMs: number }) => ({ ...settings, updatedAt: '2026-09-24T10:00:00.000Z' })),
    getAssistantPromptOverride: vi.fn(async () => undefined),
    saveAssistantPromptOverride: vi.fn(async (prompt: string) => ({ prompt, updatedAt: '2026-09-24T10:00:00.000Z' })),
    deleteAssistantPromptOverride: vi.fn(async () => undefined),
  };
  const specService = { getSpec: vi.fn(async () => ({ content: '# Test spec' })) };
  const controller = new AdminController(repository as unknown as BookingRepository, {} as BookingService, {} as AvailabilityService, specService as unknown as SpecService);
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

  it('returns default bot settings and saves valid overrides', async () => {
    const { controller, repository } = setup();
    expect(await controller.botSettings()).toEqual({ maxReadDelayMs: 2000, typingDelayPerSymbolMs: 600, isCustom: false });
    expect(await controller.updateBotSettings({ maxReadDelayMs: 750, typingDelayPerSymbolMs: 400 })).toEqual({ maxReadDelayMs: 750, typingDelayPerSymbolMs: 400, isCustom: true, updatedAt: '2026-09-24T10:00:00.000Z' });
    expect(repository.saveBotSettingsOverride).toHaveBeenCalledWith({ maxReadDelayMs: 750, typingDelayPerSymbolMs: 400 });
  });

  it('rejects bot settings outside documented limits', async () => {
    const { controller, repository } = setup();
    await expect(controller.updateBotSettings({ maxReadDelayMs: 10_001, typingDelayPerSymbolMs: 600 })).rejects.toThrow();
    await expect(controller.updateBotSettings({ maxReadDelayMs: 1000, typingDelayPerSymbolMs: 800.5 })).rejects.toThrow();
    expect(repository.saveBotSettingsOverride).not.toHaveBeenCalled();
  });
});
