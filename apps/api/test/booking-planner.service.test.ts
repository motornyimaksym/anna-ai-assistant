import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingPlannerService } from '../src/booking-planner.service.js';
import { BOOKING_SYSTEM_PROMPT } from '../src/booking-prompt.js';
const conversation = { telegramChatId: 'chat', assistantEnabled: true, state: 'active', summary: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
const context = { telegramChatId: 'chat', clientId: 'client' };
const start = () => new Date(Date.now() + 86400000).toISOString();
const ready = () => ({ status: 'ready', serviceId: 'massage', durationMinutes: 60, startAt: start(), candidateStarts: [], question: null });
const setup = () => {
  vi.stubEnv('OPENAI_API_KEY', 'test');
  const repository = {
    getBookingPromptOverride: vi.fn(async () => undefined as { prompt: string; updatedAt: string } | undefined),
    getKnowledgeBaseOverride: vi.fn(async () => undefined), listMessages: vi.fn(async () => []),
    listServices: vi.fn(async () => [{ id: 'massage', name: 'Massage', enabled: true, durationMinutes: 60, bufferMinutes: 15, price: 1000, currency: 'UAH' }]),
    listLockedIntervals: vi.fn(async () => [] as { start: string; end: string }[]),
    getBooking: vi.fn(), getBookingTiming: vi.fn(async () => ({ durationMinutes: 60, bufferMinutes: 15 })),
  };
  const schedule = { readSnapshot: vi.fn(async () => ({ status: 'success', syncedAt: new Date().toISOString(), slots: [{ text: 'Пн: 13:00', createdAt: new Date().toISOString() }] })) };
  const calendar = { getBusyIntervals: vi.fn(async () => [] as { start: string; end: string }[]), getBooking: vi.fn(), getBookingTiming: vi.fn(async () => ({ durationMinutes: 60, bufferMinutes: 15 })) };
  const debug = { record: vi.fn(async () => {}) };
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(ready()) }] }] }) }));
  vi.stubGlobal('fetch', fetcher);
  const service = new BookingPlannerService(repository as never, schedule as never, calendar as never, debug as never);
  const plan = (intent: 'availability' | 'create' | 'reschedule' = 'create', bookingId: string | null = null) => service.plan(conversation, context, 'Запишіть мене завтра', { intent, bookingId });
  const output = (value: unknown) => fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }) });
  return { repository, schedule, calendar, debug, fetcher, plan, output, service };
};
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('structured booking planner', () => {
  it('sends raw schedule and busy intervals to its separate schema-constrained prompt', async () => {
    const { plan, fetcher } = setup();
    expect((await plan()).status).toBe('ready');
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.instructions).toContain(BOOKING_SYSTEM_PROMPT);
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(JSON.parse(body.input[0].content)).toMatchObject({ messages: [{ text: 'Пн: 13:00' }], busy: [], intent: 'create' });
    expect(body.tools).toBeUndefined();
  });
  it('uses saved booking prompt independently of conversation prompt', async () => {
    const { plan, repository, fetcher } = setup();
    repository.getBookingPromptOverride.mockResolvedValue({ prompt: 'Custom booking instruction', updatedAt: new Date().toISOString() });
    await plan();
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.instructions).toContain('Custom booking instruction');
    expect(body.instructions).toContain('No Calendar write occurs until System One confirms explicit natural-language client approval.');
    expect(body.instructions).not.toContain('/confirm');
  });
  it('returns the clarification question without fabricating a plan', async () => {
    const { plan, output } = setup();
    const result = { status: 'needs_clarification', serviceId: null, startAt: null, durationMinutes: null, candidateStarts: [], question: 'Який масаж вас цікавить?' };
    output(result);
    expect(await plan()).toEqual(result);
  });
  it.each([
    [{ serviceId: null, durationMinutes: 60 }, 'послугу'],
    [{ serviceId: 'massage', durationMinutes: null }, 'тривалість'],
  ])('clarifies missing selection in a ready plan', async (missing, expected) => {
    const { plan, output } = setup();
    output({ ...ready(), ...missing });
    const result = await plan();
    expect(result.status).toBe('needs_clarification');
    expect(result.question).toContain(expected);
    expect(result.startAt).toBeNull();
    expect(result.candidateStarts).toEqual([]);
  });
  it('returns unavailable without a provider call when Calendar is unreadable', async () => {
    const { plan, calendar, fetcher, debug } = setup();
    calendar.getBusyIntervals.mockRejectedValue(new Error('Secret provider detail'));
    expect((await plan()).status).toBe('unavailable');
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(debug.record.mock.calls)).not.toContain('Secret provider detail');
  });
  it('rejects stale schedule instead of guessing availability', async () => {
    const { plan, schedule, fetcher } = setup();
    schedule.readSnapshot.mockResolvedValue({ status: 'success', syncedAt: new Date(Date.now() - 360000).toISOString(), slots: [{ text: 'OLD', createdAt: new Date().toISOString() }] });
    expect((await plan()).status).toBe('unavailable');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['past', 'horizon', 'service', 'duration', 'extra'])('rejects invalid %s output', async (kind) => {
    const { plan, output } = setup();
    const value = ready();
    output(kind === 'past' ? { ...value, startAt: '2020-01-01T00:00:00Z' } : kind === 'horizon' ? { ...value, startAt: new Date(Date.now() + 40 * 86400000).toISOString() } : kind === 'service' ? { ...value, serviceId: 'made-up' } : kind === 'duration' ? { ...value, durationMinutes: 90 } : { ...value, invented: true });
    expect((await plan()).status).toBe('unavailable');
  });
  it('rejects an overlap with the session buffer and Calendar bookings', async () => {
    const { plan, output, calendar } = setup();
    const value = ready(); output(value);
    calendar.getBusyIntervals.mockResolvedValue([{ start: new Date(Date.parse(value.startAt) + 65 * 60000).toISOString(), end: new Date(Date.parse(value.startAt) + 90 * 60000).toISOString() }]);
    expect((await plan()).status).toBe('unavailable');
  });
  it('normalizes offset-aware starts to UTC and returns availability candidates only', async () => {
    const { plan, output } = setup();
    const value = ready(); const offsetStart = new Date(Date.parse(value.startAt) + 3 * 3600000).toISOString().replace('Z', '+03:00'); output({ ...value, startAt: null, candidateStarts: [offsetStart] });
    expect(await plan('availability')).toMatchObject({ status: 'ready', startAt: null, candidateStarts: [value.startAt] });
  });
  it('accepts a redundant choice question only after validating ready availability', async () => {
    const { plan, output, debug } = setup();
    const value = ready();
    output({ ...value, startAt: null, candidateStarts: [value.startAt], question: 'Який час підходить?' });
    expect(await plan('availability')).toMatchObject({ status: 'ready', question: null, candidateStarts: [value.startAt] });
    expect(debug.record).toHaveBeenCalledWith(context, 'booking_result', expect.objectContaining({ status: 'ready' }));
  });
  it('returns the raw messages and live Calendar intervals used for planning', async () => {
    const { service, output, calendar } = setup();
    const value = ready();
    const busy = [{ start: new Date(Date.now() + 2 * 86400000).toISOString(), end: new Date(Date.now() + 2 * 86400000 + 3600000).toISOString() }];
    calendar.getBusyIntervals.mockResolvedValue(busy);
    output({ ...value, startAt: null, candidateStarts: [value.startAt] });
    const result = await service.planWithContext(conversation, context, 'Завтра коли?', { intent: 'availability', bookingId: null });
    expect(result.plan.status).toBe('ready');
    expect(result.evidence).toMatchObject({ scheduleMessages: [{ text: 'Пн: 13:00' }], calendar: { status: 'ready', busy }, timezone: expect.any(String) });
  });
  it('rejects another client booking before Calendar or OpenAI access', async () => {
    const { plan, fetcher, calendar } = setup();
    calendar.getBooking.mockResolvedValue({ id: 'b', clientId: 'other', telegramChatId: 'chat', status: 'confirmed' });
    expect((await plan('reschedule', 'b')).status).toBe('needs_clarification');
    expect(fetcher).not.toHaveBeenCalled(); expect(calendar.getBusyIntervals).not.toHaveBeenCalled();
  });
  it('preserves rescheduled duration and excludes only the owned booking from conflict checks', async () => {
    const { plan, calendar } = setup();
    const booking = { id: 'b', clientId: 'client', telegramChatId: 'chat', status: 'confirmed', serviceId: 'massage', startAt: start() };
    calendar.getBooking.mockResolvedValue(booking);
    expect((await plan('reschedule', 'b')).status).toBe('ready');
    expect(calendar.getBusyIntervals).toHaveBeenCalledWith(expect.any(String), expect.any(String), booking);
    expect(calendar.getBookingTiming).toHaveBeenCalledWith('b');
  });
  it('handles provider failure as unavailable without logging client content', async () => {
    const { plan, fetcher, debug, service } = setup();
    const errorLog = vi.spyOn((service as unknown as { logger: { error: (message: string) => void } }).logger, 'error');
    fetcher.mockRejectedValue(new Error('Запишіть мене завтра'));
    expect((await plan()).status).toBe('unavailable');
    expect(JSON.stringify(debug.record.mock.calls)).not.toContain('Запишіть мене завтра');
    expect(errorLog.mock.calls[0]![0]).not.toContain('Запишіть мене завтра');
  });
});
