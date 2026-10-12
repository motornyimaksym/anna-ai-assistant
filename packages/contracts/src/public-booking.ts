import { z } from 'zod';

const oneLineText = (max: number) => z.string().trim().min(1).max(max).refine((value) => [...value].every((character) => {
  const codePoint = character.codePointAt(0)!;
  return codePoint >= 0x20 && !(codePoint >= 0x7f && codePoint <= 0x9f) && codePoint !== 0x2028 && codePoint !== 0x2029;
}), 'Enter a single-line value');

export const publicBookingOptionSchema = z.object({ durationMinutes: z.number().int().min(15).max(480), price: z.number().finite().min(500) }).strict();
export const publicBookingServiceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  options: z.array(publicBookingOptionSchema).min(1).max(10),
  currency: z.literal('UAH'),
});

export const publicBookingSlotsRequestSchema = z.object({
  serviceId: z.string().min(1),
  durationMinutes: z.number().int().min(15).max(480),
  date: z.string().date(),
}).strict();
export const publicBookingSlotsResponseSchema = z.object({ slots: z.array(z.string().datetime()) }).strict();

export const publicBookingStartRequestSchema = z.object({
  serviceId: z.string().min(1),
  durationMinutes: z.number().int().min(15).max(480),
  startAt: z.string().datetime({ offset: true }),
  clientName: oneLineText(120),
  clientContact: oneLineText(256),
}).strict();

export const publicBookingReservationStatusSchema = z.enum([
  'invoice_pending', 'pending_payment', 'payment_failed', 'expired', 'calendar_creating', 'confirmed', 'manual_review',
]);
export const publicBookingReservationSchema = z.object({
  id: z.string().uuid(),
  status: publicBookingReservationStatusSchema,
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  serviceId: z.string().min(1),
  serviceName: z.string().min(1).max(120),
  durationMinutes: z.number().int().min(15).max(480),
  bufferMinutes: z.number().int().min(0).max(120),
  price: z.number().finite().min(500),
  currency: z.literal('UAH'),
  depositAmount: z.literal(500),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  clientName: oneLineText(120),
  clientContact: oneLineText(256),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  holdExpiresAt: z.string().datetime(),
  invoiceId: z.string().min(1).optional(),
  paymentStatus: z.string().max(40).optional(),
  paymentModifiedAt: z.string().datetime().optional(),
  paidAt: z.string().datetime().optional(),
  bookingId: z.string().uuid().optional(),
  calendarLeaseId: z.string().uuid().optional(),
  calendarLeaseUntil: z.string().datetime().optional(),
  reviewReason: z.enum(['slot_unavailable', 'payment_mismatch', 'calendar_uncertain']).optional(),
}).strict();

export const publicBookingStartResponseSchema = z.object({
  reservationId: z.string().uuid(),
  token: z.string().min(32),
  paymentUrl: z.string().url().refine((value) => value.startsWith('https://')),
  expiresAt: z.string().datetime(),
}).strict();

export const publicBookingStatusResponseSchema = z.object({
  status: z.enum(['pending_payment', 'payment_failed', 'expired', 'processing', 'confirmed', 'manual_review']),
  serviceName: z.string().min(1).max(120),
  durationMinutes: z.number().int().min(15).max(480),
  startAt: z.string().datetime(),
  price: z.number().finite().min(500),
  currency: z.literal('UAH'),
  depositAmount: z.literal(500),
  remainingAmount: z.number().finite().nonnegative(),
  address: z.string().optional(),
}).strict();

export type PublicBookingService = z.infer<typeof publicBookingServiceSchema>;
export type PublicBookingSlotsRequest = z.infer<typeof publicBookingSlotsRequestSchema>;
export type PublicBookingStartRequest = z.infer<typeof publicBookingStartRequestSchema>;
export type PublicBookingReservation = z.infer<typeof publicBookingReservationSchema>;
export type PublicBookingStartResponse = z.infer<typeof publicBookingStartResponseSchema>;
export type PublicBookingStatusResponse = z.infer<typeof publicBookingStatusResponseSchema>;
