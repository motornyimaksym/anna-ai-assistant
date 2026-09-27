import { describe, expect, it, vi } from 'vitest';
import { BookingRepository } from '../src/repository.js';

const { getFirestore } = vi.hoisted(() => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore }));

describe('editable prompt storage', () => {
  it('keeps every prompt override in its own document and resets one at a time', async () => {
    const data = new Map<string, Record<string, unknown>>();
    getFirestore.mockReturnValue({ collection: (name: string) => ({ doc: (id: string) => ({
      get: async () => ({ data: () => data.get(`${name}/${id}`) }),
      set: async (value: Record<string, unknown>) => { data.set(`${name}/${id}`, value); },
      delete: async () => { data.delete(`${name}/${id}`); },
    }) }) });
    const repository = new BookingRepository({} as never);
    const ids = ['routing', 'approval', 'probability', 'general', 'booking-conversation', 'booking-planner'] as const;
    for (const id of ids) {
      expect(await repository.getPromptOverride(id)).toBeUndefined();
      await repository.savePromptOverride(id, `Custom ${id}`);
    }
    expect(data.size).toBe(ids.length);
    for (const id of ids) expect(await repository.getPromptOverride(id)).toMatchObject({ prompt: `Custom ${id}` });
    await repository.deletePromptOverride('approval');
    expect(await repository.getPromptOverride('approval')).toBeUndefined();
    expect(await repository.getPromptOverride('routing')).toMatchObject({ prompt: 'Custom routing' });
    data.set('assistantSettings/systemOneRoutingPrompt', { prompt: 'Legacy instructions', updatedAt: '2026-09-24T10:00:00.000Z' });
    expect(await repository.getRoutingPromptOverride()).toEqual({ instructions: 'Legacy instructions', updatedAt: '2026-09-24T10:00:00.000Z' });
    await repository.saveRoutingPromptOverride({ instructions: 'Route request', general: 'Facts', booking: 'Appointments' });
    expect(await repository.getRoutingPromptOverride()).toMatchObject({ instructions: 'Route request', general: 'Facts', booking: 'Appointments' });
  });
});
