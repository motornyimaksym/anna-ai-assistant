import { describe, expect, it, vi } from 'vitest';
import { seed } from '../src/seed.js';
import type { BookingRepository } from '../src/repository.js';

describe('development seed', () => {
  it('creates services with the documented 30-minute buffer', async () => {
    const repository = { saveService: vi.fn(async (value: unknown) => value), setRules: vi.fn() };
    await seed(repository as unknown as BookingRepository);
    expect(repository.saveService).toHaveBeenCalledTimes(2);
    for (const [service] of repository.saveService.mock.calls) {
      expect(service).toMatchObject({ bufferMinutes: 30 });
    }
  });
});
