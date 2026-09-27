import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { debugDetailsSchema, debugEventSchema, type DebugDetails, type DebugEvent } from '@booking/contracts';
import { BookingRepository } from './repository.js';

export type TraceContext = { telegramChatId: string; traceId?: string };
export const safeErrorCategory = (error: unknown): string => {
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return 'timeout';
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
