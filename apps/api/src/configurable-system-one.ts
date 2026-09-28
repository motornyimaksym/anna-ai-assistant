import { Injectable } from '@nestjs/common';
import { BookingRepository } from './repository.js';
import { OpenAiSystemOneSelector } from './openai-system-one.js';
import { FallbackSystemOneSelector } from './fallback-system-one.js';
import { SystemOneSelector, type SystemOneDecisionInput } from './system-one.js';

@Injectable()
export class ConfigurableSystemOneSelector extends SystemOneSelector {
  constructor(private readonly repository: BookingRepository, private readonly openai: OpenAiSystemOneSelector, private readonly typesafe: FallbackSystemOneSelector) { super(); }
  private async provider(signal: AbortSignal): Promise<SystemOneSelector> {
    signal.throwIfAborted();
    const settings = await this.repository.getSystemOneSettings();
    signal.throwIfAborted();
    return settings.provider === 'typesafe' ? this.typesafe : this.openai;
  }
  async estimateProbability(input: SystemOneDecisionInput, signal: AbortSignal) { return (await this.provider(signal)).estimateProbability(input, signal); }
}
