import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { AdminGuard, AdminOwnerGuard } from '../src/auth.js';
import { GoogleCalendarController } from '../src/google-calendar.controller.js';
describe('Calendar owner API', () => {
  it('requires owner auth for every operation and rejects arbitrary callback configuration', () => {
    expect(Reflect.getMetadata('__guards__', GoogleCalendarController)).toEqual([AdminGuard, AdminOwnerGuard]);
    const service = { start: vi.fn(), complete: vi.fn() }; const controller = new GoogleCalendarController(service as never);
    const request = { headers: {}, admin: { uid: 'owner', isOwner: true } };
    expect(() => controller.start(request, { redirectUri: 'https://evil.test' })).toThrow();
    controller.start(request, {}); expect(service.start).toHaveBeenCalledWith('owner');
    controller.complete(request, { state: 'a'.repeat(43), code: 'code' });
    expect(service.complete).toHaveBeenCalledWith('owner', { state: 'a'.repeat(43), code: 'code' });
  });
});
