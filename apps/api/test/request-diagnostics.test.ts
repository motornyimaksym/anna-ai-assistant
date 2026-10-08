import { describe, expect, it, vi } from 'vitest';
import { traceProviderRequest, withRequestDiagnostics } from '../src/request-diagnostics.js';

describe('OpenAI request diagnostics', () => {
  it('redacts signed Firebase archive URLs and file-search excerpts', async () => {
    const write = vi.fn(async (_request: unknown, _bodies: { requestBody: string; responseBody?: string }) => {});
    const signedUrl = 'https://storage.googleapis.com/private/result.json?X-Goog-Signature=secret-signature';
    await withRequestDiagnostics(write, () => traceProviderRequest({ provider: 'openai', operation: 's2_assistant', endpoint: 'https://api.openai.com/v1/responses' }, {
      model: 'test-model', instructions: `Archive: ${signedUrl}`,
    }, async () => ({ status: 'completed', output: [{ type: 'file_search_call', results: [{ text: 'Private archive excerpt' }] }] })));

    const requestBody = write.mock.calls[0]![1].requestBody;
    const responseBody = write.mock.calls[0]![1].responseBody;
    expect(requestBody).not.toContain('secret-signature');
    expect(requestBody).toContain('[FIREBASE STORAGE URL REDACTED]');
    expect(responseBody).not.toContain('Private archive excerpt');
    expect(responseBody).toContain('[FILE SEARCH RESULTS OMITTED]');
  });
});
