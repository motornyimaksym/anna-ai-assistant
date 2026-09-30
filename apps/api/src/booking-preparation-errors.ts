export const preparationErrors = {
  BOOKING_SERVICE_UNAVAILABLE: 'Обрану послугу не знайдено серед активних. Перевірте каталог і виберіть актуальну послугу.',
  BOOKING_DURATION_UNAVAILABLE: 'Обрана тривалість недоступна для цієї послуги. Перевірте варіанти тривалості.',
  BOOKING_SCHEDULE_UNAVAILABLE: 'Немає свіжого доступного розкладу. Перевірте джерело та синхронізацію розкладу.',
  BOOKING_CALENDAR_UNAVAILABLE: 'Дані зайнятості календаря недоступні. Перевірте підключення та календар.',
  BOOKING_TIME_INVALID: 'Обраний час некоректний або вже минув. Перевірте дату й час.',
  BOOKING_RANGE_UNAVAILABLE: 'Сеанс виходить за межі перевіреного періоду календаря. Виберіть час у межах доступного періоду.',
  BOOKING_TIME_BUSY: 'Обраний час перетинається із зайнятістю календаря, враховуючи перерву. Виберіть інший час.',
} as const;
export type PreparationErrorCode = keyof typeof preparationErrors;
export class BookingPreparationError extends Error {
  constructor(readonly code: PreparationErrorCode) { super(code); }
}
export function isPreparationErrorCode(value: unknown): value is PreparationErrorCode {
  return typeof value === 'string' && Object.hasOwn(preparationErrors, value);
}
