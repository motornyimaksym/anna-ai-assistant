import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminDebugGuard, AdminGuard, canViewDebug } from '../src/auth.js';
import { AdminController } from '../src/controllers.js';
import { DebugLogService } from '../src/debug-log.service.js';

afterEach(() => { vi.unstubAllEnvs(); });
describe('private diagnostics', () => {
  it('allows only the sole owner and rejects other administrators on the server', () => {
    vi.stubEnv('ADMIN_UIDS', 'owner'); vi.stubEnv('DEBUG_OWNER_UID', undefined);
    const guard = new AdminDebugGuard();
    const context = (admin: unknown) => ({ switchToHttp: () => ({ getRequest: () => ({ admin }) }) }) as never;
    expect(guard.canActivate(context({ uid: 'owner', isOwner: true }))).toBe(true);
    expect(() => guard.canActivate(context({ uid: 'other', isOwner: false }))).toThrow();
    expect(() => guard.canActivate(context(undefined))).toThrow();
  });
  it('fails closed for multiple owners unless one existing owner is selected', () => {
    vi.stubEnv('ADMIN_UIDS', 'owner,other'); vi.stubEnv('DEBUG_OWNER_UID', undefined);
    expect(canViewDebug({ uid: 'owner', isOwner: true })).toBe(false);
    vi.stubEnv('DEBUG_OWNER_UID', 'owner');
    expect(canViewDebug({ uid: 'owner', isOwner: true })).toBe(true);
    expect(canViewDebug({ uid: 'other', isOwner: true })).toBe(false);
    vi.stubEnv('DEBUG_OWNER_UID', 'outsider');
    expect(canViewDebug({ uid: 'outsider', isOwner: true })).toBe(false);
  });
  it('protects log and payload routes with authentication and exact owner guards', () => {
    expect(Reflect.getMetadata('__guards__', AdminController)).toContain(AdminGuard);
    expect(Reflect.getMetadata('__guards__', AdminController.prototype.debugLogs)).toContain(AdminDebugGuard);
    expect(Reflect.getMetadata('__guards__', AdminController.prototype.debugLogPayload)).toContain(AdminDebugGuard);
  });
  it('strips unknown detail fields and hashes chat identifiers', async () => {
    const repository = { appendDebugEvent: vi.fn(async () => {}) };
    const service = new DebugLogService(repository as never);
    await service.record({ telegramChatId: 'private-chat-id' }, 'booking_result', { status: 'unavailable', secret: 'private-key' } as never);
    const event = repository.appendDebugEvent.mock.calls[0]![0] as unknown as { chatRef: string; details: unknown };
    expect(event.chatRef).toHaveLength(12);
    expect(JSON.stringify(event)).not.toContain('private-chat-id');
    expect(JSON.stringify(event)).not.toContain('private-key');
    expect(event.details).toEqual({ status: 'unavailable' });
  });
  it('does not fail the client turn if logging storage is unavailable', async () => {
    const service = new DebugLogService({ appendDebugEvent: vi.fn(async () => { throw new Error('database unavailable'); }) } as never);
    await expect(service.record({ telegramChatId: 'chat' }, 'received')).resolves.toBeUndefined();
  });
});
