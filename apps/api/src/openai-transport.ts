import { randomUUID } from 'node:crypto';
import { fetchWithLinearBackoff } from '@booking/http';

/** Shared provider transport; callers supply their own isolated prompts and tools. */
export async function createOpenAiConversation(signal: AbortSignal): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OpenAI is not configured');
  const response = await fetchWithLinearBackoff('https://api.openai.com/v1/conversations', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, signal, body: '{}',
  }, { replaySafe: true, timeoutMs: 15_000 });
  if (!response.ok) throw Object.assign(new Error(`OpenAI HTTP ${response.status}`), { upstreamStatus: response.status, providerRequestId: response.headers?.get('x-request-id') ?? undefined });
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
  if (!response.ok) throw Object.assign(new Error(`OpenAI HTTP ${response.status}`), { upstreamStatus: response.status, providerRequestId: response.headers?.get('x-request-id') ?? undefined });
  return response.json();
}
