import { Injectable, Logger } from '@nestjs/common';
import { safeErrorCategory } from './debug-log.service.js';
import { OpenAiSystemOneSelector } from './openai-system-one.js';
import { SystemOneSelector, type SystemOneDecisionInput, type SystemOneInput } from './system-one.js';
import { TypeSafeSystemOneSelector } from './typesafe-system-one.js';
import type { SystemTwoPromptId } from './system-two.js';

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

  select(input: SystemOneInput, signal: AbortSignal): Promise<SystemTwoPromptId> {
    return this.decide('routing', signal, (attemptSignal) => this.primary.select(input, attemptSignal), (attemptSignal) => this.backup.select(input, attemptSignal));
  }

  answerBoolean(input: SystemOneDecisionInput, signal: AbortSignal): Promise<boolean> {
    return this.decide('approval', signal, (attemptSignal) => this.primary.answerBoolean(input, attemptSignal), (attemptSignal) => this.backup.answerBoolean(input, attemptSignal));
  }

  estimateProbability(input: SystemOneDecisionInput, signal: AbortSignal): Promise<number> {
    return this.decide('probability', signal, (attemptSignal) => this.primary.estimateProbability(input, attemptSignal), (attemptSignal) => this.backup.estimateProbability(input, attemptSignal));
  }
}
