import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { KnowledgeBaseService } from '../src/knowledge-base.service.js';

const mocks = vi.hoisted(() => ({
  getFirestore: vi.fn(),
  getStorage: vi.fn(),
  documents: new Map<string, Record<string, unknown>>(),
  files: new Map<string, string>(),
  deleted: Symbol('deleted'),
}));

vi.mock('firebase-admin/firestore', () => ({ getFirestore: mocks.getFirestore, FieldValue: { delete: () => mocks.deleted } }));
vi.mock('firebase-admin/storage', () => ({ getStorage: mocks.getStorage }));

const hashContent = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

describe('KnowledgeBaseService private file access', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.documents.clear();
    mocks.files.clear();
    mocks.getFirestore.mockReturnValue({
      collection: () => ({ doc: (id: string) => ({ id, get: async () => {
        const data = mocks.documents.get(id);
        return { exists: data !== undefined, data: () => data };
      } }) }),
      runTransaction: async (work: (transaction: { get: (ref: { id: string }) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>; set: (ref: { id: string }, value: Record<string, unknown>, options?: { merge?: boolean }) => void; delete: (ref: { id: string }) => void }) => Promise<unknown>) => work({
        get: async (ref) => {
          const data = mocks.documents.get(ref.id);
          return { exists: data !== undefined, data: () => data };
        },
        set: (ref, value, options) => {
          const current = mocks.documents.get(ref.id) ?? {};
          const next = options?.merge ? { ...current, ...value } : { ...value };
          for (const [key, item] of Object.entries(next)) if (item === mocks.deleted) delete next[key];
          mocks.documents.set(ref.id, next);
        },
        delete: (ref: { id: string }) => mocks.documents.delete(ref.id),
      }),
    });
    mocks.getStorage.mockReturnValue({ bucket: () => ({ file: (path: string) => ({
      save: async (content: string) => { mocks.files.set(path, content); },
      download: async () => {
        const content = mocks.files.get(path);
        if (content === undefined) throw new Error('File not found');
        return [Buffer.from(content, 'utf8')];
      },
      delete: async () => { mocks.files.delete(path); },
    }) }) });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('serves only authorized active files and rotates an expired token on use', async () => {
    const service = new KnowledgeBaseService({} as never);
    const content = 'Address: 1 Example Street';
    const hash = hashContent(content);
    const path = `assistant-knowledge-base/versions/${hash}.txt`;
    const initialTime = new Date('2026-10-13T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(initialTime);
    mocks.files.set(path, content);
    mocks.documents.set('knowledgeBase', { contentHash: hash, storagePath: path });
    mocks.documents.set('knowledgeBaseAccess', { token: 'current-secret', generatedAt: initialTime.toISOString() });

    await expect(service.readFile(hash, 'wrong-secret')).rejects.toThrow();
    await expect(service.readFile(hash, 'current-secret')).resolves.toBe(content);

    vi.setSystemTime(new Date(initialTime.getTime() + 24 * 60 * 60 * 1000 + 1));
    await expect(service.readFile(hash, 'current-secret')).resolves.toBe(content);
    const rotated = mocks.documents.get('knowledgeBaseAccess')!;
    expect(rotated.token).not.toBe('current-secret');
    expect(rotated.previousToken).toBe('current-secret');
    await expect(service.readFile(hash, 'current-secret')).resolves.toBe(content);

    vi.setSystemTime(new Date(String(rotated.previousTokenValidUntil)));
    vi.advanceTimersByTime(1);
    await expect(service.readFile(hash, 'current-secret')).rejects.toThrow();
    await expect(service.readFile('0'.repeat(64), String(rotated.token))).rejects.toThrow();
  });

  it('keeps the previous active index if publishing a new file fails', async () => {
    const service = new KnowledgeBaseService({} as never);
    const previous = { storagePath: 'assistant-knowledge-base/versions/old.txt', contentHash: 'old-hash', byteLength: 4, isCustom: true, updatedAt: '2026-10-13T10:00:00.000Z', vectorStoreId: 'vs-old', fileId: 'file-old' };
    mocks.documents.set('knowledgeBase', previous);
    mocks.documents.set('knowledgeBasePromptMigration', { status: 'complete' });
    mocks.files.set(previous.storagePath, 'old!');
    vi.stubEnv('PUBLIC_SITE_URL', 'https://example.test');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })));

    await expect(service.save('new business knowledge')).rejects.toThrow('Knowledge base indexing failed');
    expect(mocks.documents.get('knowledgeBase')).toEqual(previous);
    expect(mocks.documents.has('knowledgeBasePending')).toBe(false);
    expect(mocks.files.has(previous.storagePath)).toBe(true);
  });
});
