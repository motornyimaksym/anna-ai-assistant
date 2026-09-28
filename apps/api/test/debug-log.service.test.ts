import { describe, expect, it } from 'vitest';
import { safeErrorCategory, safeErrorDiagnostic } from '../src/debug-log.service.js';

describe('safeErrorDiagnostic', () => {
  it('keeps underlying cause and stack while redacting credential-bearing URLs', () => {
    const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' });
    const error = Object.assign(new TypeError('fetch failed at https://api.telegram.org/bot12345:secret-token/sendMessage?access_token=secret'), {
      cause,
      stack: 'TypeError: fetch failed\n    at call (https://api.telegram.org/bot12345:secret-token/sendMessage?token=secret)',
    });

    const diagnostic = JSON.stringify(safeErrorDiagnostic(error));
    expect(diagnostic).toContain('TypeError');
    expect(diagnostic).toContain('ECONNREFUSED');
    expect(diagnostic).toContain('api.telegram.org');
    expect(diagnostic).not.toContain('secret-token');
    expect(diagnostic).not.toContain('access_token=secret');
    expect(diagnostic).not.toContain('bot12345');
  });

  it('records validation issue paths without values or issue text', () => {
    const diagnostic = safeErrorDiagnostic({
      name: 'ZodError', message: 'Client text leaked here',
      issues: [{ code: 'invalid_type', path: ['response', 'output', 2, 'text'], message: 'client text leaked here', received: 'private' }],
    });
    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain('client text leaked here');
    expect(serialized).not.toContain('private');
    expect(serialized).toContain('invalid_type');
    expect(serialized).toContain('output');
  });

  it('keeps detailed exception context and full bounded stack while removing known client content', () => {
    const clientText = 'my private appointment request';
    const stack = ['Error: failure', ...Array.from({ length: 24 }, (_, index) => `    at frame${index} (/app/service.ts:${index + 1}:1)`)].join('\n');
    const error = Object.assign(new Error(`Failure for ${clientText}; token=hidden`), {
      upstreamStatus: 503,
      providerRequestId: 'req_123-abc',
      cause: Object.assign(new TypeError('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' }),
      stack,
    });

    const diagnostic = safeErrorDiagnostic(error, [clientText]);
    const serialized = JSON.stringify(diagnostic);
    expect(diagnostic.upstreamStatus).toBe(503);
    expect(diagnostic.providerRequestId).toBe('req_123-abc');
    expect(diagnostic.stack).toHaveLength(20);
    expect(diagnostic.cause?.code).toBe('ECONNREFUSED');
    expect(serialized).toContain('[CONTENT REDACTED]');
    expect(serialized).not.toContain(clientText);
    expect(serialized).not.toContain('token=hidden');
  });

  it('redacts bearer/API keys, identity data and secret URL parts', () => {
    const error = new Error('Authorization: Bearer abc.def secret=sk-proj-0123456789abcdefghijk user@example.com phone +380 50 123 45 67 at https://api.example.test/private/path?token=secret');
    const diagnostic = JSON.stringify(safeErrorDiagnostic(error));
    expect(diagnostic).not.toContain('abc.def');
    expect(diagnostic).not.toContain('sk-proj-0123456789abcdefghijk');
    expect(diagnostic).not.toContain('user@example.com');
    expect(diagnostic).not.toContain('+380 50 123 45 67');
    expect(diagnostic).not.toContain('/private/path');
    expect(diagnostic).not.toContain('token=secret');
  });
});


it.each([
  ['OPENAI_DECISION_TOKEN_LIMIT', 'provider output token limit'],
  ['OPENAI_DECISION_INCOMPLETE', 'provider response incomplete'],
])('categorizes safe System One failure %s', (code, category) => {
  const error = Object.assign(new Error('System One decision failed'), { code });
  expect(safeErrorCategory(error)).toBe(category);
  expect(safeErrorDiagnostic(error).code).toBe(code);
});
