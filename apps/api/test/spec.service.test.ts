import { describe, expect, it } from 'vitest';
import { SpecService } from '../src/spec.service.js';

describe('SpecService', () => {
  it('returns the repository SPEC.md', async () => {
    const result = await new SpecService().getSpec();
    expect(result.content).toContain('# Специфікація проєкту');
    expect(result.content).toContain('### 25.6. Specs');
  });
});
