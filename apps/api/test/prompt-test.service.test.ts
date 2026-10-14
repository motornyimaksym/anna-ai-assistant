import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromptTestController } from '../src/prompt-test.controller.js';
import { PromptTestService } from '../src/prompt-test.service.js';
import { AdminDebugGuard, AdminGuard } from '../src/auth.js';
import { requestOpenAiResponse } from '../src/openai-transport.js';

vi.mock('../src/openai-transport.js', () => ({ requestOpenAiResponse: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); });
const setup = () => {
  const repository = {
    getPromptOverride: vi.fn(async () => ({ prompt: 'CUSTOM GENERAL', updatedAt: new Date().toISOString() })),
    listServices: vi.fn(async () => []), getBotSettingsOverride: vi.fn(async () => undefined),
    saveConversation: vi.fn(), replacePendingAction: vi.fn(), appendDebugEvent: vi.fn(),
  };
  const selector = { estimateProbability: vi.fn(async () => 0.75) };
  const knowledgeBase = { activeIndex: vi.fn(async () => ({ vectorStoreId: 'vs-1', fileId: 'file-1', contentHash: 'hash' })) };
  return { repository, selector, knowledgeBase, service: new PromptTestService(repository as never, selector as never, knowledgeBase as never) };
};

describe('isolated prompt tester', () => {
  it('protects the route with admin and designated debug owner guards', () => {
    expect(Reflect.getMetadata('__guards__', PromptTestController)).toEqual([AdminGuard, AdminDebugGuard]);
  });
  it('tests handoff against synthetic delivered history and draft', async () => {
    const { service, selector } = setup();
    expect(await service.run({ system: 'one', promptId: 'handoff', text: 'Так' })).toEqual({ kind: 'decision', output: '0.75', sampleContext: true });
    expect(selector.estimateProbability).toHaveBeenCalledWith({ question: expect.stringContaining('Cop'), context: expect.stringContaining('recent_messages') }, expect.any(AbortSignal));
  });
  it('uses current General override and returns model text', async () => {
    const { service, repository } = setup();
    vi.mocked(requestOpenAiResponse).mockResolvedValue({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello there' }] }] });
    expect(await service.run({ system: 'two', promptId: 'assistant', text: 'Hello' })).toEqual({ kind: 'text', output: 'Hello there', sampleContext: false });
    const body = vi.mocked(requestOpenAiResponse).mock.calls[0]?.[0];
    expect((body?.input as { content: string }[])[0]?.content).toContain('CUSTOM GENERAL');
    expect(body?.store).toBe(false);
    expect(body?.tools).toContainEqual({ type: 'file_search', vector_store_ids: ['vs-1'], max_num_results: 5 });
    expect(repository.saveConversation).not.toHaveBeenCalled();
  });
  it('reports Booking tool requests without executing or persisting them', async () => {
    const { service, repository } = setup();
    repository.getPromptOverride.mockResolvedValue({ prompt: 'CUSTOM BOOKING CONVERSATION', updatedAt: new Date().toISOString() });
    vi.mocked(requestOpenAiResponse).mockResolvedValue({ status: 'completed', output: [{ type: 'function_call', name: 'get_booking_context', arguments: '{}'  }] });
    const result = await service.run({ system: 'two', promptId: 'assistant', text: 'Any times tomorrow?' });
    expect(result.kind).toBe('tool_calls');
    expect(result.output).toContain('get_booking_context');
    expect(repository.getPromptOverride).toHaveBeenCalledWith('assistant');
    expect((vi.mocked(requestOpenAiResponse).mock.calls[0]![0].input as { content: string }[])[0]?.content).toContain('CUSTOM BOOKING CONVERSATION');
    expect(repository.replacePendingAction).not.toHaveBeenCalled();
    expect(repository.appendDebugEvent).not.toHaveBeenCalled();
  });
  it('rejects invalid prompt pairs before provider calls and hides provider errors', async () => {
    const { service } = setup();
    await expect(service.run({ system: 'one', promptId: 'booking-planner', text: 'x' })).rejects.toThrow();
    expect(requestOpenAiResponse).not.toHaveBeenCalled();
    vi.mocked(requestOpenAiResponse).mockRejectedValue(new Error('secret provider payload'));
    await expect(service.run({ system: 'two', promptId: 'assistant', text: 'Hello' })).rejects.toThrow('Prompt test failed (other error).');
  });

  it('reports an empty knowledge search as a human handoff with a reason', async () => {
    const { service } = setup();
    vi.mocked(requestOpenAiResponse).mockResolvedValue({ status: 'completed', output: [{ type: 'file_search_call', status: 'completed', results: [] }] });
    await expect(service.run({ system: 'two', promptId: 'assistant', text: 'What is the address?' })).resolves.toMatchObject({ kind: 'tool_calls', output: expect.stringContaining('knowledge_not_found') });
  });
});
