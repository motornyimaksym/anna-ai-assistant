import { describe, expect, it } from 'vitest';
import { adminAccessResponseSchema, updateAdminAccessSchema } from './index.js';

describe('admin access contracts', () => {
  it('normalizes valid stakeholder addresses to lowercase', () => {
    expect(updateAdminAccessSchema.parse({ emails: [' Stakeholder@Example.com '] })).toEqual({ emails: ['stakeholder@example.com'] });
  });

  it('rejects malformed, duplicate, and over-limit email lists', () => {
    expect(updateAdminAccessSchema.safeParse({ emails: ['nope'] }).success).toBe(false);
    expect(updateAdminAccessSchema.safeParse({ emails: ['User@example.com', 'user@example.com'] }).success).toBe(false);
    expect(updateAdminAccessSchema.safeParse({ emails: Array.from({ length: 101 }, (_, index) => `user${index}@example.com`) }).success).toBe(false);
  });

  it('validates access response shape', () => {
    expect(adminAccessResponseSchema.parse({ emails: ['Admin@example.com'], canManage: true, updatedAt: '2026-09-24T10:00:00.000Z' })).toEqual({ emails: ['admin@example.com'], canManage: true, updatedAt: '2026-09-24T10:00:00.000Z' });
  });
});
