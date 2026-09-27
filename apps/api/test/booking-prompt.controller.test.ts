import { describe, expect, it, vi } from 'vitest';
import { AdminController } from '../src/controllers.js';
import { BOOKING_SYSTEM_PROMPT } from '../src/booking-prompt.js';
describe('booking prompt settings', () => {
  it('uses an independent default, saves valid edits, and resets only the booking prompt', async () => {
    let current: { prompt: string; updatedAt: string } | undefined;
    const repository = {
      getBookingPromptOverride: vi.fn(async () => current),
      saveBookingPromptOverride: vi.fn(async (prompt: string) => { current = { prompt, updatedAt: new Date().toISOString() }; }),
      deleteBookingPromptOverride: vi.fn(async () => { current = undefined; }),
    };
    const controller = new AdminController(repository as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    expect(await controller.bookingPrompt()).toEqual({ prompt: BOOKING_SYSTEM_PROMPT, isCustom: false });
    await expect(controller.updateBookingPrompt({ prompt: '   ' })).rejects.toThrow();
    expect(repository.saveBookingPromptOverride).not.toHaveBeenCalled();
    expect(await controller.updateBookingPrompt({ prompt: 'Use these booking instructions' })).toMatchObject({ isCustom: true, prompt: 'Use these booking instructions' });
    expect(await controller.resetBookingPrompt()).toEqual({ prompt: BOOKING_SYSTEM_PROMPT, isCustom: false });
  });
});
