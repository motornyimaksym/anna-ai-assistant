import { describe, expect, it } from 'vitest';
import { humanErrorContext, safeErrorCategory, safeErrorDiagnostic } from '../src/debug-log.service.js';

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

it('keeps responder error details bounded without leaking credentials, client text or stack', () => {
  const clientText = 'Private client request';
  const error = Object.assign(new Error(`OpenAI rejected ${clientText}; token=hidden`), { upstreamStatus: 429, code: 'RATE_LIMITED', providerRequestId: 'req_123' });
  const context = humanErrorContext(error, 'OpenAI System Two', [clientText]);
  expect(context).toContain('Не вдалося сформувати відповідь асистента');
  expect(context).toContain('HTTP 429');
  expect(context).toContain('Код помилки: RATE_LIMITED');
  expect(context).toContain('ID запиту: req_123');
  expect(context).not.toContain(clientText);
  expect(context).not.toContain('hidden');
  expect(context).not.toContain('OpenAI System Two');
  expect(context).not.toContain(' at ');
  expect(context.length).toBeLessThanOrEqual(700);
});

it('explains booking date-time validation failures in Ukrainian without Zod internals', () => {
  const error = Object.assign(new Error('Invalid datetime'), {
    name: 'ZodError',
    issues: [{ code: 'invalid_string', path: ['arguments', 'startAt'], message: 'Invalid datetime', validation: 'datetime' }],
  });
  const context = humanErrorContext(error, 'S2 tool prepare_booking');
  expect(context).toContain('Не вдалося перевірити дату й час');
  expect(context).toContain('Формат дати або часу не прийнято');
  expect(context).toContain('пропозицію та запис до календаря не створено');
  expect(context).not.toContain('ZodError');
  expect(context).not.toContain('invalid_string');
  expect(context).not.toContain('Invalid datetime');
});

it('shows a sanitized stack trace when no localized diagnosis is available', () => {
  const clientText = 'Private appointment details';
  const error = Object.assign(new Error('Internal failure'), {
    stack: `Error: ${clientText}\n    at handler (/app/api/handler.ts:12:3)\n    at next (/app/api/next.ts:8:1)`,
  });
  const context = humanErrorContext(error, 'Unknown operation', [clientText]);
  expect(context).toContain('Людське пояснення причини недоступне.');
  expect(context).toContain('Технічний стек викликів:');
  expect(context).toContain('at handler (/app/api/handler.ts:12:3)');
  expect(context).not.toContain(clientText);
  expect(context).not.toContain('Unknown operation');
  expect(context.length).toBeLessThanOrEqual(1500);
});


it.each([
  ['OPENAI_DECISION_TOKEN_LIMIT', 'provider output token limit'],
  ['OPENAI_DECISION_INCOMPLETE', 'provider response incomplete'],
  ['BOOKING_PROPOSAL_FACT_MISMATCH', 'booking proposal fact mismatch'],
])('categorizes safe failure %s', (code, category) => {
  const error = Object.assign(new Error('System One decision failed'), { code });
  expect(safeErrorCategory(error)).toBe(category);
  expect(safeErrorDiagnostic(error).code).toBe(code);
});

it('explains proposal fact mismatches without returning an unhelpful stack trace', () => {
  const error = Object.assign(new Error('Proposal confirmation facts were not verified'), { code: 'BOOKING_PROPOSAL_FACT_MISMATCH', factIssues: ['date', 'currency', 'private client text'], stack: 'Error\n    at OpenAiService.run (/workspace/dist/openai.service.js:121:27)' });
  const context = humanErrorContext(error, 'OpenAI System Two');
  expect(context).toContain('Не вдалося перевірити факти пропозиції запису');
  expect(context).toContain('Перевірка не пройдена: дата, валюта.');
  expect(context).not.toContain('private client text');
  expect(context).not.toContain('Технічний стек викликів');
  expect(context).not.toContain('openai.service.js');
  expect(safeErrorDiagnostic(error).factIssues).toEqual(['date', 'currency']);
});
