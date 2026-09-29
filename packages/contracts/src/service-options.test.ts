import { describe, expect, it } from 'vitest';
import { serviceSchema, pendingActionSchema } from './index.js';
import { defaultServiceCaption } from './service-presentation.js';

const service = { id: 'massage', name: 'Massage', description: '', durationMinutes: 60, price: 1500, bufferMinutes: 15, currency: 'UAH', enabled: true };
describe('service duration options', () => {
  it('keeps legacy services and validates additional duration/price pairs', () => {
    expect(serviceSchema.parse(service)).toEqual(service);
    expect(serviceSchema.parse({ ...service, durationOptions: [{ durationMinutes: 90, price: 2000 }] }).durationOptions).toEqual([{ durationMinutes: 90, price: 2000 }]);
    for (const durationOptions of [[{ durationMinutes: 60, price: 100 }], [{ durationMinutes: 90, price: -1 }], [{ durationMinutes: 14, price: 100 }], [{ durationMinutes: 90.5, price: 100 }], Array.from({ length: 10 }, (_, i) => ({ durationMinutes: 100 + i, price: 100 }))]) {
      expect(serviceSchema.safeParse({ ...service, durationOptions }).success).toBe(false);
    }
  });
  it('lists every duration and price in automatic Telegram captions', () => {
    const caption = defaultServiceCaption({ ...service, durationOptions: [{ durationMinutes: 90, price: 2000 }] }, true);
    expect(caption).toContain('60 хв · 1500 UAH');
    expect(caption).toContain('90 хв · 2000 UAH');
    expect(caption.length).toBeLessThanOrEqual(1024);
  });
  it('persists numeric duration in pending booking proposals', () => {
    expect(pendingActionSchema.parse({ name: 'create_booking', arguments: { serviceId: 'massage', durationMinutes: 90 }, expiresAt: '2099-01-01T00:00:00.000Z' }).arguments.durationMinutes).toBe(90);
  });
});

it('preserves natural confirmation facts and legacy exact-text proposals', () => {
  const legacy = { name: 'cancel_booking', arguments: { bookingId: 'booking' }, expiresAt: '2099-01-01T00:00:00.000Z' };
  expect(pendingActionSchema.parse(legacy)).toEqual(legacy);
  const proposal = { ...legacy, id: '2a1c75d0-d891-4e04-8b54-341cba762ae6', confirmationText: 'Cancel your appointment tomorrow at 10:00?' };
  expect(pendingActionSchema.parse(proposal)).toEqual(proposal);
  expect(pendingActionSchema.safeParse({ ...proposal, confirmationText: 'x'.repeat(4001) }).success).toBe(false);
  const facts = { serviceName: 'Massage', durationMinutes: 60, localDate: '30 вер. 2026 р.', localTime: '20:00', price: 1500, currency: 'UAH', referenceCode: 'f6b473a6' };
  expect(pendingActionSchema.parse({ ...legacy, id: '2a1c75d0-d891-4e04-8b54-341cba762ae6', confirmationFacts: facts })).toMatchObject({ confirmationFacts: facts });
  expect(pendingActionSchema.safeParse({ ...legacy, confirmationFacts: { ...facts, referenceCode: 'not-a-code' } }).success).toBe(false);
});
