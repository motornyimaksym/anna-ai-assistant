import { describe, expect, it } from 'vitest';
import { loadBackendEnv } from './index.js';

describe('loadBackendEnv', () => {
  it('defaults the local API port to 2301', () => {
    expect(loadBackendEnv({}).PORT).toBe(2301);
  });
});
