import { Injectable, Logger } from '@nestjs/common';
import { safeErrorCategory } from './debug-log.service.js';
import { OpenAiSystemOneSelector } from './openai-system-one.js';
import { SystemOneSelector, type SystemOneDecisionInput } from './system-one.js';
import { TypeSafeSystemOneSelector } from './typesafe-system-one.js';

@Injectable()
export class FallbackSystemOneSelector extends SystemOneSelector {
  private readonly logger = new Logger(FallbackSystemOneSelector.name);

  constructor(private readonly primary: TypeSafeSystemOneSelector, private readonly backup: OpenAiSystemOneSelector) { super(); }

  private async decide<T>(operation: string, signal: AbortSignal, primary: (signal: AbortSignal) => Promise<T>, backup: (signal: AbortSignal) => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    try {
      return await primary(AbortSignal.any([signal, AbortSignal.timeout(30_000)]));
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      this.logger.warn(`TypeSafe System One ${operation} failed category=${safeErrorCategory(error)}; trying OpenAI`);
      return backup(AbortSignal.any([signal, AbortSignal.timeout(10_000)]));
    }
  }

  estimateProbability(input: SystemOneDecisionInput, signal: AbortSignal): Promise<number> {
    return this.decide('handoff', signal, (attemptSignal) => this.primary.estimateProbability(input, attemptSignal), (attemptSignal) => this.backup.estimateProbability(input, attemptSignal));
  }
}
