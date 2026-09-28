import { traceProviderRequest } from './request-diagnostics.js';
import { randomUUID } from 'node:crypto';
import { fetchWithLinearBackoff } from '@booking/http';
import { collectSensitiveStrings, sanitizeOpenAiError } from './debug-log.service.js';

async function openAiHttpError(response: Response, request: unknown, key: string): Promise<Error> {
  const error = Object.assign(new Error(`OpenAI HTTP ${response.status}`), { upstreamStatus: response.status, providerRequestId: response.headers?.get('x-request-id') ?? undefined });
  const reader = response.body?.getReader();
  if (!reader) return error;
  try {
    const chunks: Uint8Array[] = [];
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
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
  return traceProviderRequest({ provider: 'openai', operation: 'conversation_create', endpoint: 'https://api.openai.com/v1/conversations' }, {}, async (observer) => {
    const response = await fetchWithLinearBackoff('https://api.openai.com/v1/conversations', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, signal, body: '{}',
    }, { replaySafe: true, timeoutMs: 15_000, onAttempt: observer.attempt });
    await observer.response(response);
    if (!response.ok) throw await openAiHttpError(response, {}, key);
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string' || !data.id) throw new Error('Invalid OpenAI conversation');
    return data.id;
  });
}
export async function requestOpenAiResponse(body: Record<string, unknown>, signal: AbortSignal, operationOverride?: string): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OpenAI is not configured');
  const payload = { model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini', ...(!body.conversation ? { store: false } : {}), ...body };
  const format = (body.text as { format?: { name?: string } } | undefined)?.format?.name;
  const operation = operationOverride ?? (format === 'probability_estimate' ? 's1_handoff' : 's2_assistant');
  return traceProviderRequest({ provider: 'openai', operation, endpoint: 'https://api.openai.com/v1/responses' }, payload, async (observer) => {
    const response = await fetchWithLinearBackoff('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, signal,
      body: JSON.stringify(payload),
    }, { replaySafe: true, timeoutMs: 30_000, onAttempt: observer.attempt });
    await observer.response(response);
    if (!response.ok) throw await openAiHttpError(response, body, key);
    return response.json();
  });
}
