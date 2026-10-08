import { AsyncLocalStorage } from 'node:async_hooks';
import type { DebugRequest } from '@booking/contracts';
import { collectSensitiveStrings, safeErrorCategory, safeErrorDiagnostic } from './debug-log.service.js';

export type RequestBodies = { requestBody: string; responseBody?: string };
type Writer = (request: DebugRequest, bodies: RequestBodies) => Promise<void>;
const scope = new AsyncLocalStorage<Writer>();
export const withRequestDiagnostics = <T>(write: Writer, work: () => Promise<T>): Promise<T> => scope.run(write, work);
const credentialKey = /^(?:authorization|cookie|set.cookie|.*(?:api[_-]?key|secret|password|token|session|api[_-]?hash)|token|encrypted_content)$/i;
const safeText = (value: unknown, max = 100): string | undefined => typeof value === 'string' && /^[a-zA-Z0-9_./:-]+$/.test(value) ? value.slice(0, max) : undefined;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const utf8 = (value: string, bytes: number) => { let result = Buffer.from(value).subarray(0, bytes).toString('utf8'); while (Buffer.byteLength(result) > bytes) result = result.slice(0, -1); return result; };

function cleanText(value: string): string {
  const secrets = Object.entries(process.env).filter(([key, item]) => credentialKey.test(key) && item && item.length >= 4).map(([, item]) => item!);
  let text = value;
  for (const secret of secrets) text = text.replaceAll(secret, '[REDACTED]');
  return text.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]').replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}/g, '[REDACTED]').replace(/\bbot\d+:[A-Za-z0-9_-]+/g, 'bot[REDACTED]').replace(/https:\/\/(?:storage\.googleapis\.com|firebasestorage\.googleapis\.com)\/[^\s"'<>]+/gi, '[FIREBASE STORAGE URL REDACTED]').replace(/data:[^\s"']+;base64,[A-Za-z0-9+/=]+/g, '[BINARY OMITTED]');
}

function clean(value: unknown): unknown {
  if (typeof value === 'string') {
    if (/^\s*[[{]/.test(value)) {
      let embedded: unknown;
      try { embedded = JSON.parse(value); } catch { return cleanText(value); }
      return JSON.stringify(clean(embedded));
    }
    return cleanText(value);
  }
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    if (object(value).type === 'reasoning') return { type: 'reasoning', content: '[REASONING OMITTED]' };
    if (object(value).type === 'file_search_call') return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [key, key === 'results' ? '[FILE SEARCH RESULTS OMITTED]' : clean(child)]));
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, credentialKey.test(key) ? '[REDACTED]' : clean(child)]));
  }
  return value;
}

function sanitizeBody(raw: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return cleanText(raw); }
  return JSON.stringify(clean(parsed), null, 2);
}

function boundedText(value: unknown, limit: number): string {
  const text = JSON.stringify(clean(value ?? null), null, 2);
  let bounded = utf8(text, limit);
  while (Buffer.byteLength(JSON.stringify(bounded)) > limit) bounded = utf8(bounded, Math.floor(Buffer.byteLength(bounded) * 0.9));
  return bounded;
}

/** Instrument only requests inside an explicitly established Telegram trace. */
export async function traceProviderRequest<T>(metadata: Pick<DebugRequest, 'provider' | 'operation' | 'endpoint'>, body: Record<string, unknown>, work: (observer: { attempt: (number: number) => void; response: (response: Response) => Promise<void> }) => Promise<T>): Promise<T> {
  const write = scope.getStore();
  let attempts = 0; let httpStatus: number | undefined; let providerRequestId: string | undefined; let capturedResponseBody: string | undefined;
  const started = Date.now();
  let result: T | undefined; let failed: unknown;
  try {
    result = await work({
      attempt: (number) => { attempts = number; },
      response: async (response) => {
        httpStatus = response.status;
        providerRequestId = safeText(response.headers?.get('x-request-id'), 120);
        try { capturedResponseBody = await response.clone().text(); } catch { /* Preserve provider result if diagnostic body read fails. */ }
      },
    });
    return result;
  } catch (error) { failed = error; throw error; }
  finally {
    if (write) {
      try {
        const rawRequest = JSON.stringify(body ?? null);
        const rawResponse = capturedResponseBody !== undefined ? capturedResponseBody : result === undefined ? undefined : JSON.stringify(result);
        const requestBody = sanitizeBody(rawRequest);
        const responseBody = rawResponse === undefined ? undefined : sanitizeBody(rawResponse);
        const output = object(result);
        const usage = output.usage ? boundedText(output.usage, 1500) : undefined;
        await write({ ...metadata, method: 'POST', model: safeText(body.model),
          conversationAttached: typeof body.conversation === 'string', conversationId: safeText(body.conversation, 200), previousResponseId: safeText(body.previous_response_id, 200),
          store: typeof body.store === 'boolean' ? body.store : undefined, maxOutputTokens: typeof body.max_output_tokens === 'number' ? body.max_output_tokens : undefined,
          attempts, durationMs: Date.now() - started, httpStatus, providerRequestId,
          responseStatus: safeText(output.status), incompleteReason: safeText(object(output.incomplete_details).reason), usage,
          outputTypes: Array.isArray(output.output) ? output.output.slice(0, 20).map((item) => safeText(object(item).type) ?? 'unknown') : [],
          errorCategory: failed ? safeErrorCategory(failed) : undefined,
          errorDiagnostic: failed ? boundedText(safeErrorDiagnostic(failed, collectSensitiveStrings(body)), 2500) : undefined,
          requestBytes: Buffer.byteLength(rawRequest), responseBytes: rawResponse === undefined ? 0 : Buffer.byteLength(rawResponse),
        }, { requestBody, ...(responseBody === undefined ? {} : { responseBody }) });
      } catch { /* Diagnostic failure must not change the request result. */ }
    }
  }
}
