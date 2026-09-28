import { AsyncLocalStorage } from 'node:async_hooks';
import type { DebugRequest } from '@booking/contracts';
import { collectSensitiveStrings, safeErrorCategory, safeErrorDiagnostic } from './debug-log.service.js';

type Writer = (request: DebugRequest) => Promise<void>;
const scope = new AsyncLocalStorage<Writer>();
export const withRequestDiagnostics = <T>(write: Writer, work: () => Promise<T>): Promise<T> => scope.run(write, work);
const credentialKey = /^(?:authorization|cookie|set.cookie|.*(?:api[_-]?key|secret|password|token|session|api[_-]?hash)|token|encrypted_content)$/i;
const safeText = (value: unknown, max = 100): string | undefined => typeof value === 'string' && /^[a-zA-Z0-9_./:-]+$/.test(value) ? value.slice(0, max) : undefined;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const utf8 = (value: string, bytes: number) => { let result = Buffer.from(value).subarray(0, bytes).toString('utf8'); while (Buffer.byteLength(result) > bytes) result = result.slice(0, -1); return result; };
function preview(value: unknown, limit: number) {
  const raw = JSON.stringify(value ?? null);
  const secrets = Object.entries(process.env).filter(([key, item]) => credentialKey.test(key) && item && item.length >= 4).map(([, item]) => item!);
  const clean = (item: unknown, depth = 0): unknown => {
    if (depth > 20) return '[DEPTH LIMIT]';
    if (typeof item === 'string') {
      if (/^\s*[[{]/.test(item)) { try { return JSON.stringify(clean(JSON.parse(item), depth + 1)); } catch { /* Not embedded JSON. */ } }
      let text = item;
      for (const secret of secrets) text = text.replaceAll(secret, '[REDACTED]');
      return text.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]').replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}/g, '[REDACTED]').replace(/\bbot\d+:[A-Za-z0-9_-]+/g, 'bot[REDACTED]').replace(/data:[^\s"']+;base64,[A-Za-z0-9+/=]+/g, '[BINARY OMITTED]');
    }
    if (Array.isArray(item)) return item.map((child) => clean(child, depth + 1));
    if (item && typeof item === 'object') {
      if (object(item).type === 'reasoning') return { type: 'reasoning', content: '[REASONING OMITTED]' };
      return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, credentialKey.test(key) ? '[REDACTED]' : clean(child, depth + 1)]));
    }
    return item;
  };
  const text = JSON.stringify(clean(value ?? null), null, 2);
  let bounded = utf8(text, limit);
  while (Buffer.byteLength(JSON.stringify(bounded)) > limit) bounded = utf8(bounded, Math.floor(Buffer.byteLength(bounded) * 0.9));
  return { text: bounded, bytes: Buffer.byteLength(raw), truncated: bounded !== text };
}

/** Instrument only requests inside an explicitly established Telegram trace. */
export async function traceProviderRequest<T>(metadata: Pick<DebugRequest, 'provider' | 'operation' | 'endpoint'>, body: Record<string, unknown>, work: (observer: { attempt: (number: number) => void; response: (response: Response) => void }) => Promise<T>): Promise<T> {
  const write = scope.getStore();
  let attempts = 0; let httpStatus: number | undefined; let providerRequestId: string | undefined;
  const started = Date.now();
  let result: T | undefined; let failed: unknown;
  try {
    result = await work({ attempt: (number) => { attempts = number; }, response: (response) => { httpStatus = response.status; providerRequestId = safeText(response.headers?.get('x-request-id'), 120); } });
    return result;
  } catch (error) { failed = error; throw error; }
  finally {
    if (write) {
      try {
        const request = preview(body, 16 * 1024); const response = preview(result, 8 * 1024); const output = object(result);
        const usage = output.usage ? preview(output.usage, 1500).text : undefined;
        await write({ ...metadata, method: 'POST', model: safeText(body.model),
          conversationAttached: typeof body.conversation === 'string', conversationId: safeText(body.conversation, 200), previousResponseId: safeText(body.previous_response_id, 200),
          store: typeof body.store === 'boolean' ? body.store : undefined, maxOutputTokens: typeof body.max_output_tokens === 'number' ? body.max_output_tokens : undefined,
          attempts, durationMs: Date.now() - started, httpStatus, providerRequestId,
          responseStatus: safeText(output.status), incompleteReason: safeText(object(output.incomplete_details).reason), usage,
          outputTypes: Array.isArray(output.output) ? output.output.slice(0, 20).map((item) => safeText(object(item).type) ?? 'unknown') : [],
          errorCategory: failed ? safeErrorCategory(failed) : undefined,
          errorDiagnostic: failed ? preview(safeErrorDiagnostic(failed, collectSensitiveStrings(body)), 2500).text : undefined,
          requestBytes: request.bytes, responseBytes: response.bytes, requestPreview: request.text, responsePreview: response.text, requestTruncated: request.truncated, responseTruncated: response.truncated,
        });
      } catch { /* Diagnostic failure must not change the request result. */ }
    }
  }
}
