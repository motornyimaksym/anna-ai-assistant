import { describe, expect, it } from 'vitest';
import { loadBackendEnv, loadBackendRuntimeEnv } from './index.js';

describe('loadBackendEnv', () => {
  it('defaults the local API port to 2301', () => {
    expect(loadBackendEnv({}).PORT).toBe(2301);
  });
  it('uses the Firebase runtime project ID in production when no override is set', () => {
    expect(loadBackendEnv({ NODE_ENV: 'production' }).FIREBASE_PROJECT_ID).toBeUndefined();
  });
  it('does not depend on the Firebase Functions port value', () => {
    expect(loadBackendRuntimeEnv({ PORT: 'managed-by-runtime' }).DEFAULT_TIMEZONE).toBe('Europe/Kyiv');
  });
});
