import { describe, expect, it, vi } from 'vitest';
import { BookingRepository } from '../src/repository.js';
import type { UpdateBotSettingsRequest } from '@booking/contracts';

const { getFirestore } = vi.hoisted(() => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore, FieldValue: { delete: vi.fn() } }));

describe('bot settings persistence', () => {
  it('defaults old documents to tester-only mode and preserves all-users mode for older clients', async () => {
    let stored: Record<string, unknown> | undefined = {
      maxReadDelayMs: 2_000,
      typingDelayPerSymbolMs: 600,
      testerUsernames: ['tester'],
      allUsersEnabled: true,
      updatedAt: '2026-10-06T10:00:00.000Z',
    };
    const ref = { get: vi.fn(async () => ({ exists: !!stored, data: () => stored })), set: vi.fn(async (value) => { stored = value; }) };
    getFirestore.mockReturnValue({ collection: () => ({ doc: () => ref }) });
    const repository = new BookingRepository({} as never);

    stored = { maxReadDelayMs: 2_000, typingDelayPerSymbolMs: 600, testerUsernames: ['tester'], updatedAt: '2026-10-06T10:00:00.000Z' };
    expect((await repository.getBotSettingsOverride())?.allUsersEnabled).toBe(false);
    stored.allUsersEnabled = true;

    const legacyUpdate: UpdateBotSettingsRequest = { maxReadDelayMs: 1_000, typingDelayPerSymbolMs: 300, testerUsernames: ['tester'] };
    await repository.saveBotSettingsOverride(legacyUpdate);

    expect(stored).toEqual({ ...legacyUpdate, allUsersEnabled: true, updatedAt: expect.any(String) });
  });
});
