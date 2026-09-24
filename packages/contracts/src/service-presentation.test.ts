import { describe, expect, it } from 'vitest';
import { defaultServiceCaption } from './service-presentation.js';

describe('default Telegram service caption', () => {
  it('keeps description, duration, and price in photo captions within Telegram limits', () => {
    const caption = defaultServiceCaption({ name: 'Massage', description: '🙂'.repeat(2000), durationMinutes: 60, price: 1500, currency: 'UAH' }, true);
    expect(caption).toContain('Massage');
    expect(caption).toContain('60 хв · 1500 UAH');
    expect(caption.length).toBeLessThanOrEqual(1024);
  });

  it('keeps the full description in text-only service messages', () => {
    const caption = defaultServiceCaption({ name: 'Massage', description: 'Classic massage', durationMinutes: 60, price: 1500, currency: 'UAH' }, false);
    expect(caption).toBe('Massage\n\nClassic massage\n\n60 хв · 1500 UAH');
  });
});
