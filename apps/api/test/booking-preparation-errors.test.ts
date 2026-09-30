import { expect, it } from 'vitest';
import { BookingPreparationError, preparationErrors, type PreparationErrorCode } from '../src/booking-preparation-errors.js';
import { humanErrorContext, safeErrorCategory } from '../src/debug-log.service.js';
it.each(Object.keys(preparationErrors) as PreparationErrorCode[])('preserves a safe diagnostic and localized preparation explanation for %s', (code) => {
  const error = new BookingPreparationError(code);
  expect(safeErrorCategory(error)).toBe(code);
  const context = humanErrorContext(error, 'S2 tool prepare_booking');
  expect(context.length).toBeGreaterThan(0);
  expect(context.length).toBeLessThanOrEqual(700);
  expect(context).not.toMatch(/\bat\s+.*\.(?:ts|js):\d+/);
});
