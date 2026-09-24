import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAuthService, AdminGuard, AdminOwnerGuard } from '../src/auth.js';
import type { FirebaseAdminService } from '../src/firebase-admin.js';
import type { BookingRepository } from '../src/repository.js';

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken }) }));

describe('admin access authentication', () => {
  const repository = { getAdminAccessOverride: vi.fn() };
  let auth: AdminAuthService;
  beforeEach(() => {
    process.env.ADMIN_UIDS = 'owner-uid';
    repository.getAdminAccessOverride.mockReset().mockResolvedValue({ emails: ['stakeholder@example.com'], updatedAt: '2026-09-24T10:00:00.000Z' });
    verifyIdToken.mockReset();
    auth = new AdminAuthService({} as FirebaseAdminService, repository as unknown as BookingRepository);
  });

  it('recognizes owner UIDs independently of email verification', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'owner-uid', email: 'owner@example.com', email_verified: false });
    await expect(auth.verify('Bearer valid-token')).resolves.toEqual({ uid: 'owner-uid', email: 'owner@example.com', isOwner: true });
    expect(repository.getAdminAccessOverride).not.toHaveBeenCalled();
  });

  it('grants a verified matching email stakeholder access', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'stakeholder-uid', email: 'Stakeholder@Example.com', email_verified: true });
    await expect(auth.verify('Bearer valid-token')).resolves.toEqual({ uid: 'stakeholder-uid', email: 'stakeholder@example.com', isOwner: false });
  });

  it('rejects unverified or non-allowlisted stakeholder emails', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'stakeholder-uid', email: 'stakeholder@example.com', email_verified: false });
    await expect(auth.verify('Bearer valid-token')).rejects.toThrow();
    verifyIdToken.mockResolvedValue({ uid: 'other-uid', email: 'other@example.com', email_verified: true });
    await expect(auth.verify('Bearer valid-token')).rejects.toThrow();
    await expect(auth.verify(undefined)).rejects.toThrow();
  });

  it('stores the authenticated principal and restricts owner-only actions', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'stakeholder-uid', email: 'stakeholder@example.com', email_verified: true });
    const request = { headers: { authorization: 'Bearer valid-token' } } as { headers: Record<string, string | undefined>; admin?: unknown };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as never;
    await expect(new AdminGuard(auth).canActivate(context)).resolves.toBe(true);
    expect(request.admin).toEqual({ uid: 'stakeholder-uid', email: 'stakeholder@example.com', isOwner: false });
    expect(() => new AdminOwnerGuard().canActivate(context)).toThrow();
    request.admin = { uid: 'owner-uid', email: 'owner@example.com', isOwner: true };
    expect(new AdminOwnerGuard().canActivate(context)).toBe(true);
  });
});
