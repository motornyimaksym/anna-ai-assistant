import { describe, expect, it, vi } from 'vitest';
import { AdminController } from '../src/controllers.js';
import { ASSISTANT_SYSTEM_PROMPT } from '../src/assistant-prompt.js';
import type { AvailabilityService } from '../src/availability.service.js';
import type { BookingService } from '../src/booking.service.js';
import type { BookingRepository } from '../src/repository.js';
import type { SpecService } from '../src/spec.service.js';

const setup = () => {
  const repository = {
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
});
