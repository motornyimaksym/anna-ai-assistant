import { readFile } from 'node:fs/promises';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { telegramArchiveSettingsSchema } from '@booking/contracts';
import { TELEGRAM_ARCHIVE_STORAGE_PATH } from './telegram-archive.service.js';

type OpenAiFile = { id?: unknown };
type VectorStore = { id?: unknown };
type VectorStoreFile = { status?: unknown; last_error?: { message?: unknown } | null };

const parseJsonResponse = async <T>(response: Response, action: string): Promise<T> => {
  if (!response.ok) throw new Error(`${action} failed (${response.status})`);
  return await response.json() as T;
};

async function openAiRequest<T>(url: string, init: RequestInit, apiKey: string): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...init.headers },
    signal: AbortSignal.timeout(120_000),
  });
  return parseJsonResponse<T>(response, 'OpenAI archive indexing');
}

async function main(): Promise<void> {
  const sourcePath = process.argv[2];
  if (!sourcePath) throw new Error('Provide path to Telegram result.json');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');

  const firebaseConfig = (() => {
    try { return JSON.parse(process.env.FIREBASE_CONFIG ?? '{}') as { projectId?: string; storageBucket?: string }; }
    catch { return {}; }
  })();
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? firebaseConfig.projectId;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET ?? firebaseConfig.storageBucket;
  if (!projectId || !storageBucket) throw new Error('FIREBASE_PROJECT_ID and FIREBASE_STORAGE_BUCKET are required');

  const contents = await readFile(sourcePath);
  const parsed = JSON.parse(contents.toString('utf8')) as { chats?: { list?: unknown[] } };
  if (!Array.isArray(parsed.chats?.list)) throw new Error('Telegram export JSON has an unexpected shape');

  const app = initializeApp({ credential: applicationDefault(), projectId, storageBucket });
  const archiveObject = getStorage(app).bucket(storageBucket).file(TELEGRAM_ARCHIVE_STORAGE_PATH);
  await archiveObject.save(contents, { resumable: false, metadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } });

  let openAiFileId: string | undefined;
  let vectorStoreId: string | undefined;
  try {
    const form = new FormData();
    form.set('purpose', 'user_data');
    form.set('file', new Blob([new Uint8Array(contents)], { type: 'application/json' }), 'result.json');
    const file = await openAiRequest<OpenAiFile>('https://api.openai.com/v1/files', { method: 'POST', body: form }, apiKey);
    if (typeof file.id !== 'string') throw new Error('OpenAI archive indexing returned no file ID');
    openAiFileId = file.id;

    const store = await openAiRequest<VectorStore>('https://api.openai.com/v1/vector_stores', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'AiMassage Telegram history' }),
    }, apiKey);
    if (typeof store.id !== 'string') throw new Error('OpenAI archive indexing returned no vector store ID');
    vectorStoreId = store.id;

    await openAiRequest(`https://api.openai.com/v1/vector_stores/${encodeURIComponent(vectorStoreId)}/files`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: openAiFileId }),
    }, apiKey);

    let indexed = false;
    for (let attempt = 0; attempt < 240; attempt++) {
      const response = await openAiRequest<VectorStoreFile>(`https://api.openai.com/v1/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(openAiFileId)}`, { method: 'GET' }, apiKey);
      if (response.status === 'completed') { indexed = true; break; }
      if (response.status === 'failed' || response.status === 'cancelled') throw new Error('OpenAI could not index Telegram archive');
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
    if (!indexed) throw new Error('OpenAI archive indexing timed out');

    const settings = telegramArchiveSettingsSchema.parse({
      storagePath: TELEGRAM_ARCHIVE_STORAGE_PATH,
      openAiFileId,
      vectorStoreId,
      sourceBytes: contents.length,
      updatedAt: new Date().toISOString(),
    });
    await getFirestore(app).collection('assistantSettings').doc('telegramArchive').set(settings);
  } catch (error) {
    if (vectorStoreId) await openAiRequest(`https://api.openai.com/v1/vector_stores/${encodeURIComponent(vectorStoreId)}`, { method: 'DELETE' }, apiKey).catch(() => undefined);
    if (openAiFileId) await openAiRequest(`https://api.openai.com/v1/files/${encodeURIComponent(openAiFileId)}`, { method: 'DELETE' }, apiKey).catch(() => undefined);
    throw error;
  }
  console.log(`Telegram archive uploaded and indexed (${contents.length} bytes).`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown archive import failure';
  console.error(message);
  process.exitCode = 1;
});
