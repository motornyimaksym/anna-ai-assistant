import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { debugDetailsSchema, debugEventSchema, type DebugDetails, type DebugEvent } from '@booking/contracts';
import { BookingRepository } from './repository.js';

export type TraceContext = { telegramChatId: string; traceId?: string };
type ProviderError = { code?: string; param?: string; message?: string };
type ErrorDiagnostic = { type: string; message?: string; code?: string; providerError?: ProviderError; upstreamStatus?: number; providerRequestId?: string; issues?: Array<{ code: string; path: Array<string | number> }>; stack?: string[]; cause?: ErrorDiagnostic };
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const redact = (value: string, sensitiveValues: string[] = []): string => {
  let result = value
  .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
  .replace(/\bbot\d+:[A-Za-z0-9_-]+/gi, 'bot[REDACTED]')
  .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/g, '[API KEY REDACTED]')
  .replace(/((?:access|refresh)_token|client_secret|api[_-]?key|token)(["']?\s*[:=]\s*["']?)([^&\s"',}]+)/gi, '$1$2[REDACTED]')
  .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[TOKEN REDACTED]')
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[EMAIL REDACTED]')
  .replace(/\+?\d[\d ()-]{7,}\d/g, '[PHONE REDACTED]')
  .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
    try { const parsed = new URL(url); return `${parsed.origin}/[REDACTED]`; }
    catch { return '[URL REDACTED]'; }
  })
  .replace(/Booking ([A-Za-z0-9_-]{8,})/g, 'Booking [REDACTED]');
  for (const sensitive of sensitiveValues) {
    if (!sensitive) continue;
    if (sensitive.length >= 12) result = result.replaceAll(sensitive, '[CONTENT REDACTED]');
    else if (result === sensitive) result = '[CONTENT REDACTED]';
    else result = result.replace(new RegExp(`\\b${escapeRegExp(sensitive)}\\b`, 'g'), '[CONTENT REDACTED]');
  }
  return result.slice(0, 2000);
}

export function sanitizeOpenAiError(value: unknown, sensitiveValues: string[] = []): ProviderError | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const object = value as Record<string, unknown>;
  const result: ProviderError = {};
  if (typeof object.code === 'string' && /^[a-zA-Z0-9_]{1,80}$/.test(object.code)) result.code = redact(object.code, sensitiveValues);
  if (typeof object.param === 'string' && /^[a-zA-Z0-9_.[\]-]{1,120}$/.test(object.param)) result.param = redact(object.param, sensitiveValues);
  if (typeof object.message === 'string') result.message = redact(object.message
    .replace(/"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g, '[VALUE REDACTED]')
    .replace(/\b(?:conv|resp|call|msg|file|thread|asst)_[A-Za-z0-9_-]+\b/g, '[ID REDACTED]'), sensitiveValues);
  return Object.keys(result).length ? result : undefined;
}

function errorDiagnostic(error: unknown, depth = 0, sensitiveValues: string[] = []): ErrorDiagnostic {
  if (!error || typeof error !== 'object') return { type: typeof error };
  const object = error as { name?: unknown; message?: unknown; code?: unknown; providerError?: unknown; status?: unknown; upstreamStatus?: unknown; providerRequestId?: unknown; requestId?: unknown; stack?: unknown; cause?: unknown; issues?: unknown };
  const type = typeof object.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,59}$/.test(object.name) ? object.name : 'Error';
  const result: ErrorDiagnostic = { type };
  const providerError = sanitizeOpenAiError(object.providerError, sensitiveValues);
  if (providerError) result.providerError = providerError;
  if (typeof object.message === 'string' && type !== 'ZodError' && type !== 'SyntaxError') result.message = redact(object.message, sensitiveValues);
  if (typeof object.code === 'string' && /^[A-Z0-9_]{1,50}$/.test(object.code)) result.code = object.code;
  const upstreamStatus = object.upstreamStatus ?? object.status;
  if (typeof upstreamStatus === 'number' && Number.isInteger(upstreamStatus) && upstreamStatus >= 100 && upstreamStatus <= 599) result.upstreamStatus = upstreamStatus;
  const providerRequestId = object.providerRequestId ?? object.requestId;
  if (typeof providerRequestId === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(providerRequestId)) result.providerRequestId = providerRequestId;
  if (Array.isArray(object.issues)) {
    result.issues = object.issues.slice(0, 10).flatMap((issue) => {
      if (!issue || typeof issue !== 'object') return [];
      const entry = issue as { code?: unknown; path?: unknown };
      if (typeof entry.code !== 'string' || !Array.isArray(entry.path)) return [];
      const path = entry.path.slice(0, 8).map((part): string | number => typeof part === 'number' && Number.isSafeInteger(part) ? part : typeof part === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(part) ? part : '[field]');
      return [{ code: entry.code.slice(0, 50), path }];
    });
  }
  if (typeof object.stack === 'string') {
    result.stack = object.stack.split('\n').slice(1).filter((line) => /^\s+at /.test(line)).slice(0, 20).map((line) => redact(line, sensitiveValues));
  }
  if (depth < 4 && object.cause !== undefined) result.cause = errorDiagnostic(object.cause, depth + 1, sensitiveValues);
  return result;
}
export const safeErrorDiagnostic = (error: unknown, sensitiveValues: string[] = []): ErrorDiagnostic => errorDiagnostic(error, 0, sensitiveValues);
export function collectSensitiveStrings(value: unknown, limit = 500): string[] {
  const found = new Set<string>();
  const visit = (item: unknown, depth: number): void => {
    if (found.size >= limit || depth > 12) return;
    if (typeof item === 'string') {
      if (item.length >= 12) found.add(item);
      for (const line of item.split(/\r?\n/)) {
        if (found.size >= limit) break;
        if (line.trim().length >= 20) found.add(line.trim());
      }
      return;
    }
    if (Array.isArray(item)) { for (const child of item) visit(child, depth + 1); return; }
    if (item && typeof item === 'object') for (const child of Object.values(item)) visit(child, depth + 1);
  };
  visit(value, 0);
  return [...found];
}

export const safeErrorCategory = (error: unknown): string => {
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return 'timeout';
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'OPENAI_DECISION_TOKEN_LIMIT') return 'provider output token limit';
  if (code === 'OPENAI_DECISION_INCOMPLETE') return 'provider response incomplete';
  const status = error instanceof Error ? /^OpenAI HTTP (\d{3})$/.exec(error.message)?.[1] : undefined;
  if (status) return `provider HTTP ${status}`;
  const typesafeStatus = error instanceof Error ? /^TypeSafe HTTP (\d{3})$/.exec(error.message)?.[1] : undefined;
  if (typesafeStatus) return `TypeSafe HTTP ${typesafeStatus}`;
  const telegramStatus = error instanceof Error ? /^Telegram HTTP (\d{3})$/.exec(error.message)?.[1] : undefined;
  return telegramStatus ? `Telegram HTTP ${telegramStatus}` : 'other error';
};
@Injectable()
export class DebugLogService {
  private readonly logger = new Logger(DebugLogService.name);
  constructor(private readonly repository: BookingRepository) {}
  async record(context: TraceContext, stage: DebugEvent['stage'], details: DebugDetails = {}, level: DebugEvent['level'] = 'info'): Promise<void> {
    try {
      const event = debugEventSchema.parse({ id: randomUUID(), createdAt: new Date().toISOString(), traceId: context.traceId ?? randomUUID(), chatRef: createHash('sha256').update(context.telegramChatId).digest('hex').slice(0, 12), stage, level, details: debugDetailsSchema.parse(details) });
      await this.repository.appendDebugEvent(event);
    } catch { this.logger.warn('Diagnostic event could not be saved'); }
  }
}
