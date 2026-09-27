import { describe, expect, it, vi } from 'vitest';
import { BookingRepository } from '../src/repository.js';
const { getFirestore } = vi.hoisted(() => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore, FieldValue: { delete: vi.fn() } }));
it('defaults missing settings to OpenAI and persists only provider and timestamp', async () => {
  let stored: Record<string, unknown> | undefined;
  const ref = { get: vi.fn(async () => ({ exists: !!stored, data: () => stored })), set: vi.fn(async (value) => { stored = value; }) };
  const doc = vi.fn(() => ref); const collection = vi.fn(() => ({ doc }));
  getFirestore.mockReturnValue({ collection });
  const repository = new BookingRepository({} as never);
  expect(await repository.getSystemOneSettings()).toEqual({ provider: 'openai' });
  expect(ref.set).not.toHaveBeenCalled();
  expect(await repository.saveSystemOneSettings({ provider: 'typesafe' })).toEqual({ provider: 'typesafe' });
  expect(await repository.getSystemOneSettings()).toEqual({ provider: 'typesafe' });
  expect(stored).toEqual({ provider: 'typesafe', updatedAt: expect.any(String) });
  expect(collection).toHaveBeenCalledWith('assistantSettings'); expect(doc).toHaveBeenCalledWith('systemOne');
});
describe('invalid persisted System One settings', () => {
  it.each([{}, { provider: 'invalid' }])('fails closed for %j', async (data) => {
    getFirestore.mockReturnValue({ collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => data }) }) }) });
    await expect(new BookingRepository({} as never).getSystemOneSettings()).rejects.toThrow();
  });
});
