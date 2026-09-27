import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromptTestController } from '../src/prompt-test.controller.js';
import { PromptTestService } from '../src/prompt-test.service.js';
import { AdminDebugGuard, AdminGuard } from '../src/auth.js';
import { requestOpenAiResponse } from '../src/openai-transport.js';

vi.mock('../src/openai-transport.js', () => ({ requestOpenAiResponse: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); });
const setup = () => {
  const repository = {
    getAssistantPromptOverride: vi.fn(async () => ({ prompt: 'CUSTOM GENERAL', updatedAt: new Date().toISOString() })),
    getBookingPromptOverride: vi.fn(async () => ({ prompt: 'CUSTOM PLANNER', updatedAt: new Date().toISOString() })),
    getPromptOverride: vi.fn(async () => undefined as { prompt: string; updatedAt: string } | undefined),
    getKnowledgeBaseOverride: vi.fn(async () => undefined), listServices: vi.fn(async () => []),
    saveConversation: vi.fn(), replacePendingAction: vi.fn(), appendDebugEvent: vi.fn(),
  };
  const selector = { select: vi.fn(async () => 'booking'), answerBoolean: vi.fn(async () => true), estimateProbability: vi.fn(async () => 0.75) };
  return { repository, selector, service: new PromptTestService(repository as never, selector as never) };
};

describe('isolated prompt tester', () => {
  it('protects the route with admin and designated debug owner guards', () => {
    expect(Reflect.getMetadata('__guards__', PromptTestController)).toEqual([AdminGuard, AdminDebugGuard]);
  });
  it('routes standalone example and tests decisions against sample proposal', async () => {
    const { service, selector } = setup();
    expect(await service.run({ system: 'one', promptId: 'routing', text: 'Book tomorrow' })).toEqual({ kind: 'decision', output: 'booking', sampleContext: false });
    expect(selector.select).toHaveBeenCalledWith({ message: 'Book tomorrow', history: [], summary: '', hasPendingProposal: false }, expect.any(AbortSignal));
    expect(await service.run({ system: 'one', promptId: 'approval', text: 'Yes' })).toEqual({ kind: 'decision', output: 'true', sampleContext: true });
    expect(selector.answerBoolean.mock.calls[0]?.[0]).toMatchObject({ context: expect.stringContaining('Sample proposal') });
    expect(await service.run({ system: 'one', promptId: 'probability', text: 'Maybe' })).toEqual({ kind: 'decision', output: '0.75', sampleContext: true });
  });
  it('uses current General override and returns model text', async () => {
    const { service, repository } = setup();
    vi.mocked(requestOpenAiResponse).mockResolvedValue({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello there' }] }] });
    expect(await service.run({ system: 'two', promptId: 'general', text: 'Hello' })).toEqual({ kind: 'text', output: 'Hello there', sampleContext: false });
    const body = vi.mocked(requestOpenAiResponse).mock.calls[0]?.[0];
    expect(body?.instructions).toContain('CUSTOM GENERAL');
    expect(body?.store).toBe(false);
    expect(repository.saveConversation).not.toHaveBeenCalled();
  });
  it('reports Booking tool requests without executing or persisting them', async () => {
    const { service, repository } = setup();
    repository.getPromptOverride.mockResolvedValue({ prompt: 'CUSTOM BOOKING CONVERSATION', updatedAt: new Date().toISOString() });
    vi.mocked(requestOpenAiResponse).mockResolvedValue({ status: 'completed', output: [{ type: 'function_call', name: 'plan_booking', arguments: '{"intent":"availability","bookingId":null}' }] });
    const result = await service.run({ system: 'two', promptId: 'booking-conversation', text: 'Any times tomorrow?' });
    expect(result.kind).toBe('tool_calls');
    expect(result.output).toContain('plan_booking');
    expect(repository.getPromptOverride).toHaveBeenCalledWith('booking-conversation');
    expect(vi.mocked(requestOpenAiResponse).mock.calls[0]![0].instructions).toContain('CUSTOM BOOKING CONVERSATION');
    expect(repository.replacePendingAction).not.toHaveBeenCalled();
    expect(repository.appendDebugEvent).not.toHaveBeenCalled();
  });
  it('uses editable planner prompt and synthetic schedule, without real booking context', async () => {
    const { service, repository } = setup();
    vi.mocked(requestOpenAiResponse).mockResolvedValue({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ status: 'needs_clarification', serviceId: null, startAt: null, durationMinutes: null, candidateStarts: [], question: 'Which massage?' }) }] }] });
    const result = await service.run({ system: 'two', promptId: 'booking-planner', intent: 'availability', text: 'Tomorrow' });
    expect(result.kind).toBe('plan');
    expect(result.sampleContext).toBe(true);
    const body = vi.mocked(requestOpenAiResponse).mock.calls[0]?.[0];
    expect(body?.instructions).toContain('CUSTOM PLANNER');
    expect(JSON.stringify(body?.input)).toContain('Sample schedule');
    expect(repository.replacePendingAction).not.toHaveBeenCalled();
  });
  it('rejects invalid prompt pairs before provider calls and hides provider errors', async () => {
    const { service } = setup();
    await expect(service.run({ system: 'one', promptId: 'booking-planner', text: 'x' })).rejects.toThrow();
    expect(requestOpenAiResponse).not.toHaveBeenCalled();
    vi.mocked(requestOpenAiResponse).mockRejectedValue(new Error('secret provider payload'));
    await expect(service.run({ system: 'two', promptId: 'general', text: 'Hello' })).rejects.toThrow('Prompt test failed (other error).');
  });
});
