import type { DebugRequest } from '@booking/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { traceProviderRequest, withRequestDiagnostics } from '../src/request-diagnostics.js';

const metadata = { provider: 'openai' as const, operation: 'routing', endpoint: 'https://api.openai.com/v1/responses' };
afterEach(() => vi.unstubAllEnvs());
describe('request diagnostics', () => {
  it('records isolated request settings and incomplete response metadata without secrets or reasoning', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'secret-exact-value');
    const write = vi.fn(async () => {});
    const response = { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, usage: { output_tokens: 100 }, output: [{ type: 'reasoning', content: 'hidden thought', encrypted_content: 'encrypted secret' }] };
    const result = await withRequestDiagnostics(write, () => traceProviderRequest(metadata, { model: 'test-model', store: false, max_output_tokens: 100, instructions: 'Prompt secret-exact-value', authorization: 'Bearer hidden', context: JSON.stringify({ access_token: 'nested-private', password: 'nested-password' }), input: [{ role: 'user', content: 'Hello' }] }, async (observer) => {
      observer.attempt(2);
      await observer.response(new Response(JSON.stringify(response), { status: 200, headers: { 'x-request-id': 'req_test' } }));
      return response;
    }));
    expect(result).toBe(response);
    const detail = write.mock.calls[0]![0] as unknown as DebugRequest;
    const bodies = write.mock.calls[0]![1]!;
    expect(detail).toMatchObject({ attempts: 2, conversationAttached: false, store: false, maxOutputTokens: 100, httpStatus: 200, providerRequestId: 'req_test', responseStatus: 'incomplete', incompleteReason: 'max_output_tokens' });
    expect(bodies.requestBody).toContain('Hello');
    expect(JSON.stringify(bodies)).not.toMatch(/secret-exact-value|Bearer hidden|nested-private|nested-password|hidden thought|encrypted secret/);
  });
  it('stores complete UTF-8 request and response bodies beyond previous preview limits', async () => {
    const write = vi.fn(async () => {});
    await withRequestDiagnostics(write, () => traceProviderRequest(metadata, { instructions: '💆'.repeat(20000) }, async () => ({ output: 'ї'.repeat(20000) })));
    const detail = write.mock.calls[0]![0] as unknown as DebugRequest;
    const bodies = write.mock.calls[0]![1]!;
    expect(Buffer.byteLength(bodies.requestBody)).toBeGreaterThan(16384);
    expect(Buffer.byteLength(bodies.responseBody!)).toBeGreaterThan(8192);
    expect(JSON.parse(bodies.requestBody).instructions).toBe('💆'.repeat(20000));
    expect(JSON.parse(bodies.responseBody!).output).toBe('ї'.repeat(20000));
    expect(detail.requestBytes).toBeGreaterThan(16384);
    expect(detail.responseBytes).toBeGreaterThan(8192);
  });
  it('isolates concurrent traces and does not log calls outside a scope', async () => {
    const one = vi.fn(async () => {}); const two = vi.fn(async () => {});
    await Promise.all([withRequestDiagnostics(one, () => traceProviderRequest(metadata, { input: 'one' }, async () => { await Promise.resolve(); return { status: 'completed' }; })), withRequestDiagnostics(two, () => traceProviderRequest(metadata, { input: 'two' }, async () => ({ status: 'completed' })))]);
    expect(JSON.stringify(one.mock.calls)).toContain('one'); expect(JSON.stringify(one.mock.calls)).not.toContain('two');
    expect(JSON.stringify(two.mock.calls)).toContain('two');
    await traceProviderRequest(metadata, {}, async () => ({}));
    expect(one).toHaveBeenCalledTimes(1); expect(two).toHaveBeenCalledTimes(1);
  });
  it('preserves results and errors when logging fails', async () => {
    const write = vi.fn(async () => { throw new Error('storage unavailable'); });
    await expect(withRequestDiagnostics(write, () => traceProviderRequest(metadata, {}, async () => 42))).resolves.toBe(42);
    const error = new Error('provider failure');
    await expect(withRequestDiagnostics(write, () => traceProviderRequest(metadata, {}, async () => { throw error; }))).rejects.toBe(error);
  });
});
