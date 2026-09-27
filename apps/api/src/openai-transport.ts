import { randomUUID } from 'node:crypto';
import { fetchWithLinearBackoff } from '@booking/http';
import { collectSensitiveStrings, sanitizeOpenAiError } from './debug-log.service.js';

async function openAiHttpError(response: Response, request: unknown, key: string): Promise<Error> {
  const error = Object.assign(new Error(`OpenAI HTTP ${response.status}`), { upstreamStatus: response.status, providerRequestId: response.headers?.get('x-request-id') ?? undefined });
  const reader = response.body?.getReader();
  if (!reader) return error;
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16_384) { await reader.cancel(); return error; }
      chunks.push(chunk.value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const providerError = sanitizeOpenAiError(body && typeof body === 'object' && 'error' in body ? body.error : undefined, [key, ...collectSensitiveStrings(request)]);
    if (providerError) Object.assign(error, { providerError });
  } catch { /* Preserve the HTTP failure if its error body cannot be read. */ }
  finally { reader.releaseLock(); }
  return error;
}

/** Shared provider transport; callers supply their own isolated prompts and tools. */
export async function createOpenAiConversation(signal: AbortSignal): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OpenAI is not configured');
  const response = await fetchWithLinearBackoff('https://api.openai.com/v1/conversations', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, signal, body: '{}',
  }, { replaySafe: true, timeoutMs: 15_000 });
  if (!response.ok) throw await openAiHttpError(response, {}, key);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string' || !data.id) throw new Error('Invalid OpenAI conversation');
  return data.id;
}
export async function requestOpenAiResponse(body: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OpenAI is not configured');
  const response = await fetchWithLinearBackoff('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, signal,
    body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini', ...(!body.conversation ? { store: false } : {}), ...body }),
  }, { replaySafe: true, timeoutMs: 30_000 });
  if (!response.ok) throw await openAiHttpError(response, body, key);
  return response.json();
}
