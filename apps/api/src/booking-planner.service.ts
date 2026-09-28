import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { bookingPlanRequestSchema, bookingPlanSchema, type BookingPlan, type BookingPlanRequest, type ConversationDto } from '@booking/contracts';
import { BookingRepository } from './repository.js';
import { TelegramScheduleImportService } from './telegram-schedule-import.service.js';
import { CalendarService } from './calendar.js';
import { collectSensitiveStrings, DebugLogService, safeErrorCategory, safeErrorDiagnostic } from './debug-log.service.js';
import { requestOpenAiResponse } from './openai-transport.js';
import { BOOKING_MANDATORY_GUIDANCE, BOOKING_OUTPUT_FORMAT, BOOKING_SYSTEM_PROMPT } from './booking-prompt.js';
import { DEFAULT_KNOWLEDGE_BASE } from './default-knowledge-base.js';
import { selectServiceOption } from './service-options.js';
import type { AssistantContext } from './assistant-tools.service.js';
import type { BusyInterval } from './calendar.js';

export type BookingPlanningEvidence = {
  timezone: string;
  sourceSyncedAt: string;
  scheduleMessages: Array<{ text: string; createdAt: string }>;
  calendar: { status: 'ready'; checkedAt: string; rangeStart: string; rangeEnd: string; busy: BusyInterval[] }
    | { status: 'unavailable'; cachedCheckedAt?: string };
};
export type BookingPlanningResult = { plan: BookingPlan; evidence?: BookingPlanningEvidence };

const unavailable = (question: string): BookingPlan => ({ status: 'unavailable', serviceId: null, startAt: null, durationMinutes: null, candidateStarts: [], question });
const responseSchema = z.object({ status: z.string().optional(), output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })) });
@Injectable()
export class BookingPlannerService {
  private readonly logger = new Logger(BookingPlannerService.name);
  constructor(private readonly repository: BookingRepository, private readonly schedule: TelegramScheduleImportService, private readonly calendar: CalendarService, private readonly debug: DebugLogService) {}
  async plan(conversation: ConversationDto, context: AssistantContext, question: string, input: BookingPlanRequest, signal?: AbortSignal): Promise<BookingPlan> {
    return (await this.planWithContext(conversation, context, question, input, signal)).plan;
  }
  async planWithContext(conversation: ConversationDto, context: AssistantContext, question: string, input: BookingPlanRequest, signal?: AbortSignal): Promise<BookingPlanningResult> {
    let phase = 'context';
    let evidence: BookingPlanningEvidence | undefined;
    const sensitiveValues = [question, conversation.summary];
    try {
      const request = bookingPlanRequestSchema.parse(input);
      const now = Date.now();
      const horizon = now + 30 * 24 * 60 * 60_000;
      const rangeStart = new Date(now).toISOString();
      const rangeEnd = new Date(horizon).toISOString();
      const booking = request.intent === 'reschedule' && request.bookingId ? await this.calendar.getBooking(request.bookingId) : undefined;
      if (request.intent === 'reschedule' && (!booking || booking.clientId !== context.clientId || booking.telegramChatId !== context.telegramChatId || booking.status !== 'confirmed' || booking.calendarOperation)) {
        await this.debug.record(context, 'booking_result', { status: 'needs_clarification', reason: 'owned_booking_required' });
        return { plan: { ...unavailable('Який саме запис бажаєте перенести?'), status: 'needs_clarification' } };
      }
      const [override, knowledge, services, history, timing] = await Promise.all([
        this.repository.getBookingPromptOverride(), this.repository.getKnowledgeBaseOverride(), this.repository.listServices(),
        this.repository.listMessages(context.telegramChatId), booking ? this.calendar.getBookingTiming(booking.id) : undefined,
      ]);
      sensitiveValues.push(...history.map(({ content }) => content));
      const [scheduleResult, calendarResult] = await Promise.allSettled([
        this.schedule.readSnapshot(), this.calendar.getBusyIntervals(rangeStart, rangeEnd, booking),
      ]);
      const snapshot = scheduleResult.status === 'fulfilled' ? scheduleResult.value : undefined;
      const age = snapshot?.syncedAt ? (Date.now() - Date.parse(snapshot.syncedAt)) / 1000 : undefined;
      const scheduleReady = snapshot?.status === 'success' && age !== undefined && Number.isFinite(age) && age >= 0 && age <= 300 && snapshot.slots.length > 0;
      const busy = calendarResult.status === 'fulfilled' ? calendarResult.value : undefined;
      const calendarReady = !!busy && busy.length <= 500;
      if (scheduleReady) {
        let cachedCheckedAt: string | undefined;
        if (!calendarReady) {
          try { cachedCheckedAt = (await this.schedule.readCalendarAvailability())?.checkedAt; } catch { /* Cached metadata is optional. */ }
        }
        evidence = {
          timezone: process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv',
          sourceSyncedAt: snapshot!.syncedAt!,
          scheduleMessages: snapshot!.slots.slice(-5).map(({ text, createdAt }) => ({ text: text.slice(0, 4000), createdAt })),
          calendar: calendarReady
            ? { status: 'ready', checkedAt: new Date().toISOString(), rangeStart, rangeEnd, busy: busy! }
            : { status: 'unavailable', ...(cachedCheckedAt ? { cachedCheckedAt } : {}) },
        };
      }
      await this.debug.record(context, 'booking_context', { intent: request.intent, sourceStatus: scheduleReady ? 'ready' : 'unavailable', calendarStatus: calendarReady ? 'ready' : 'unavailable', messageCount: snapshot?.slots.length ?? 0, busyCount: busy?.length ?? 0, ...(age !== undefined && Number.isFinite(age) ? { scheduleAgeSeconds: Math.round(age) } : {}) });
      if (!scheduleReady || !calendarReady) {
        await this.debug.record(context, 'booking_result', { status: 'unavailable', reason: !scheduleReady ? 'schedule_unavailable' : 'calendar_unavailable' }, 'warn');
        return { plan: unavailable('Зараз не можу перевірити вільний час. Спробуйте, будь ласка, трохи пізніше.'), ...(evidence ? { evidence } : {}) };
      }
      phase = 'provider';
      const payload = {
        intent: request.intent, question: question.slice(0, 4000), history: history.slice(-20), summary: conversation.summary.slice(0, 4000),
        currentTime: rangeStart, timezone: process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv',
        services: services.filter((service) => service.enabled).map(({ id, name, description, durationMinutes, durationOptions, bufferMinutes, price, currency }) => ({ id, name, description, durationMinutes, durationOptions, bufferMinutes, price, currency })),
        knowledge: knowledge?.content ?? DEFAULT_KNOWLEDGE_BASE,
        messages: evidence!.scheduleMessages,
        calendarRange: { start: rangeStart, end: rangeEnd }, busy,
        ownedBooking: booking ? { serviceId: booking.serviceId, startAt: booking.startAt, durationMinutes: timing!.durationMinutes } : null,
      };
      sensitiveValues.push(...collectSensitiveStrings(payload), ...snapshot!.slots.map(({ text }) => text));
      const response = responseSchema.parse(await requestOpenAiResponse({ store: false, instructions: `${override?.prompt ?? BOOKING_SYSTEM_PROMPT}\n${BOOKING_MANDATORY_GUIDANCE}`, input: [{ role: 'user', content: JSON.stringify(payload) }], text: { format: BOOKING_OUTPUT_FORMAT }, max_output_tokens: 3000 }, signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000)));
      phase = 'validation';
      if (response.status && response.status !== 'completed') throw new Error('Incomplete planner response');
      const text = response.output.filter((item) => item.type === 'message').flatMap((item) => item.content ?? []).filter((item) => item.type === 'output_text').map((item) => item.text ?? '').join('');
      const plan = bookingPlanSchema.parse(JSON.parse(text));
      if (plan.status !== 'ready') {
        if (!plan.question || plan.serviceId !== null || plan.startAt !== null || plan.durationMinutes !== null || plan.candidateStarts.length) throw new Error('Invalid non-ready plan');
      } else {
        const service = services.find((item) => item.id === plan.serviceId && item.enabled);
        if (!service || plan.durationMinutes === null) throw new Error('Service or duration missing');
        if (plan.question !== null && request.intent !== 'availability') throw new Error('Unexpected ready question');
        if (booking ? plan.serviceId !== booking.serviceId || plan.durationMinutes !== timing!.durationMinutes : !selectServiceOption(service, plan.durationMinutes)) throw new Error('Invalid duration');
        const starts = request.intent === 'availability' ? plan.candidateStarts : plan.startAt ? [plan.startAt] : [];
        if (!starts.length || (request.intent === 'availability' ? plan.startAt !== null : plan.candidateStarts.length !== 0)) throw new Error('Invalid plan timing');
        const buffer = timing?.bufferMinutes ?? service.bufferMinutes;
        for (const start of starts) {
          const from = Date.parse(start); const through = from + (plan.durationMinutes + buffer) * 60_000;
          if (from <= Date.now() || through > horizon || busy!.some((item) => Date.parse(item.start) < through && Date.parse(item.end) > from)) throw new Error('Plan conflicts with availability');
        }
        plan.startAt = plan.startAt ? new Date(plan.startAt).toISOString() : null;
        plan.candidateStarts = [...new Set(plan.candidateStarts.map((value) => new Date(value).toISOString()))].sort();
        if (request.intent === 'availability') plan.question = null;
      }
      await this.debug.record(context, 'booking_result', { status: plan.status, intent: request.intent, ...(plan.serviceId ? { serviceId: plan.serviceId } : {}), ...(plan.startAt ? { startAt: plan.startAt } : {}), ...(plan.durationMinutes ? { durationMinutes: plan.durationMinutes } : {}), candidateCount: plan.candidateStarts.length });
      return { plan, evidence };
    } catch (error) {
      await this.debug.record(context, 'booking_result', { status: 'unavailable', reason: `${phase}_failed`, errorCategory: safeErrorCategory(error) }, 'warn');
      this.logger.error(`Booking planner ${phase} failed trace=${context.traceId ?? 'unknown'}: ${JSON.stringify(safeErrorDiagnostic(error, sensitiveValues))}`);
      return { plan: unavailable('Не вдалося перевірити цей час. Уточніть, будь ласка, послугу, тривалість та бажану дату або спробуйте пізніше.'), ...(evidence ? { evidence } : {}) };
    }
  }
}
