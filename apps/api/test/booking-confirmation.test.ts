import { describe, expect, it } from 'vitest';
import { containsBookingConfirmationFacts } from '../src/booking-confirmation.js';

const facts = { serviceName: 'Авторський чуттєвий масаж', durationMinutes: 120, localDate: '30 вер. 2026 р.', localTime: '20:00', price: 5500, currency: 'UAH' };

describe('booking confirmation facts', () => {
  it('accepts naturally rephrased facts in a different order', () => {
    expect(containsBookingConfirmationFacts('Підійде вам 30 вер. 2026 року о 20:00 авторський чуттєвий масаж? Тривалість — 120 хвилин, вартість — 5500 UAH.', facts)).toBe(true);
  });

  it('accepts client-facing date without year, zero-padded day, and grouped UAH price', () => {
    const appointment = { ...facts, serviceName: 'Авторський чуттєвий масаж', durationMinutes: 90, localDate: '1 жовт. 2026 р.', price: 4000 };
    expect(containsBookingConfirmationFacts('Авторський чуттєвий масаж, 90 хв, 01 жовтня, четвер, 20:00 - 4 000 грн. Підтверджуєте?', appointment)).toBe(true);
    expect(containsBookingConfirmationFacts('Авторський чуттєвий масаж, 90 хв, 01 жовтня, четвер, 20:00 - ₴4000. Підтверджуєте?', appointment)).toBe(true);
    expect(containsBookingConfirmationFacts('Авторський чуттєвий масаж, 90 хв, 01 жовтня 2027 року, четвер, 20:00 - 4 000 гривень. Підтверджуєте?', appointment)).toBe(false);
  });

  it('keeps legacy reference codes required only when older proposals contain one', () => {
    const legacyFacts = { ...facts, referenceCode: 'f6b473a6' };
    const codeFreeMessage = 'Авторський чуттєвий масаж, 120 хв, 30 вер. 2026 р. о 20:00, 5500 UAH.';
    expect(containsBookingConfirmationFacts(codeFreeMessage, legacyFacts)).toBe(false);
    expect(containsBookingConfirmationFacts(`${codeFreeMessage} Код f6b473a6.`, legacyFacts)).toBe(true);
  });

  it.each([
    'Підійде 30 вер. 2026 року о 20:00 авторський чуттєвий масаж за 5500 UAH?',
    'Підійде 30 вер. 2026 року о 20:00 авторський чуттєвий масаж на 120 хвилин за 5400 UAH?',
    'Підійде 30 вер. 2026 року о 20:00 авторський чуттєвий масаж на 120 хвилин за 5500 UAH, хоча раніше було 5400?',
    'Підійде 30 вер. 2026 року о 20:00 авторський чуттєвий масаж на 120 хвилин за 5500 UAH або 120 USD?',
    'Підійде 30 вер. 2026 року о 21:00 авторський чуттєвий масаж на 120 хвилин за 5500 UAH?',
  ])('rejects a missing or changed fact: %s', (message) => {
    expect(containsBookingConfirmationFacts(message, facts)).toBe(false);
  });
});
