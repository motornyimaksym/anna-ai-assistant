import { describe, expect, it } from 'vitest';
import { containsBookingConfirmationFacts } from '../src/booking-confirmation.js';

const facts = { serviceName: 'Авторський чуттєвий масаж', durationMinutes: 120, localDate: '30 вер. 2026 р.', localTime: '20:00', price: 5500, currency: 'UAH', referenceCode: 'f6b473a6' };

describe('booking confirmation facts', () => {
  it('accepts naturally rephrased facts in a different order', () => {
    expect(containsBookingConfirmationFacts('Підійде вам 30 вер. 2026 року о 20:00 авторський чуттєвий масаж? Тривалість — 120 хвилин, вартість — 5500 UAH, код f6b473a6.', facts)).toBe(true);
  });

  it.each([
    'Підійде 30 вер. 2026 року о 20:00 авторський чуттєвий масаж на 120 хвилин за 5500 UAH?',
    'Підійде 30 вер. 2026 року о 20:00 авторський чуттєвий масаж на 120 хвилин за 5400 UAH, код f6b473a6?',
    'Підійде 30 вер. 2026 року о 20:00 авторський чуттєвий масаж на 120 хвилин за 5500 UAH, хоча раніше було 5400, код f6b473a6?',
    'Підійде 30 вер. 2026 року о 20:00 авторський чуттєвий масаж на 120 хвилин за 5500 UAH або 120 USD, код f6b473a6?',
    'Підійде 30 вер. 2026 року о 21:00 авторський чуттєвий масаж на 120 хвилин за 5500 UAH, код f6b473a6?',
  ])('rejects a missing or changed fact: %s', (message) => {
    expect(containsBookingConfirmationFacts(message, facts)).toBe(false);
  });
});
