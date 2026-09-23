import { describe, expect, it } from 'vitest';
import { stripApiPrefix } from '../src/routing.js';

describe('Hosting API rewrite', () => {
  it('forwards public API routes to their NestJS route', () => {
    expect(stripApiPrefix('/api/telegram/webhook?check=1')).toBe('/telegram/webhook?check=1');
    expect(stripApiPrefix('/api/health')).toBe('/health');
    expect(stripApiPrefix('/api')).toBe('/');
    expect(stripApiPrefix('/admin/bookings')).toBe('/admin/bookings');
  });
});
