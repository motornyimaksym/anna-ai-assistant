import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { loadBackendRuntimeEnv } from '@booking/config';
import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { publicBookingServiceSchema, publicBookingStartResponseSchema, publicBookingStatusResponseSchema, publicBookingStartRequestSchema, publicBookingSlotsRequestSchema, serviceDurationOptions, type PublicBookingReservation } from '@booking/contracts';
import { serviceEndAt, ServiceNotFoundError, BookingConflictError } from '@booking/domain';
import { BookingNeedsHumanError, BookingService } from './booking.service.js';
import { AvailabilityService } from './availability.service.js';
import { MonobankAcquiringService } from './monobank-acquiring.service.js';
import { BookingRepository } from './repository.js';

const depositAmount = 500;
const studioAddress = 'вул. Юнаківа, 9В';
const monoWebhookSchema = z.object({
  invoiceId: z.string().min(1),
  status: z.string().min(1).max(40),
  amount: z.number().int().nonnegative(),
  finalAmount: z.number().int().nonnegative().optional(),
  ccy: z.number().int(),
  modifiedDate: z.string().datetime(),
  reference: z.string().uuid(),
}).passthrough();

const localDate = (startAt: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(startAt));
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}-${parts.find((part) => part.type === 'day')!.value}`;
};

@Injectable()
export class PublicBookingService {
  constructor(private readonly repository: BookingRepository, private readonly availability: AvailabilityService, private readonly bookings: BookingService, private readonly monobank: MonobankAcquiringService) {}

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new BadRequestException('Invalid public booking request');
    return result.data;
  }

  async services() {
    const services = await this.repository.listServices();
    return services.flatMap((service) => {
      if (!service.enabled || !service.publiclyAvailable || service.currency !== 'UAH') return [];
      const options = serviceDurationOptions(service).filter((option) => option.price >= depositAmount);
      if (!options.length) return [];
      return [publicBookingServiceSchema.parse({ id: service.id, name: service.name, options, currency: 'UAH' })];
    });
  }

  async slots(input: unknown) {
    try { return await this.availability.find(this.parse(publicBookingSlotsRequestSchema, input), true); }
    catch (error) {
      if (error instanceof ServiceNotFoundError) throw new NotFoundException('Service not found');
      throw error;
    }
  }

  async start(rawInput: unknown) {
    const input = this.parse(publicBookingStartRequestSchema, rawInput);
    const service = await this.repository.getService(input.serviceId);
    if (!service?.enabled || !service.publiclyAvailable || service.currency !== 'UAH') throw new NotFoundException('Service not found');
    const option = serviceDurationOptions(service).find((candidate) => candidate.durationMinutes === input.durationMinutes);
    if (!option || option.price < depositAmount) throw new NotFoundException('Service option not found');
    const startAt = new Date(input.startAt).toISOString();
    let available: Awaited<ReturnType<AvailabilityService['find']>>;
    try { available = await this.availability.find({ serviceId: service.id, durationMinutes: option.durationMinutes, date: localDate(startAt) }, true); }
    catch (error) {
      if (error instanceof ServiceNotFoundError) throw new NotFoundException('Service not found');
      throw error;
    }
    if (!available.slots.includes(startAt)) throw new ConflictException('The requested appointment time is no longer available');

    const token = randomBytes(32).toString('base64url');
    const endAt = serviceEndAt(startAt, { durationMinutes: option.durationMinutes });
    let reservation: PublicBookingReservation;
    try {
      reservation = await this.repository.createPublicBookingReservation({
        tokenHash: createHash('sha256').update(token).digest('hex'),
        serviceId: service.id,
        serviceName: service.name,
        durationMinutes: option.durationMinutes,
        bufferMinutes: service.bufferMinutes,
        price: option.price,
        currency: 'UAH',
        depositAmount,
        startAt,
        endAt,
        clientName: input.clientName,
        clientContact: input.clientContact,
      });
    } catch (error) {
      if (error instanceof BookingConflictError) throw new ConflictException('The requested appointment time is no longer available');
      throw error;
    }
    const returnUrl = new URL('/book', loadBackendRuntimeEnv(process.env).PUBLIC_SITE_URL);
    returnUrl.searchParams.set('reservation', reservation.id);
    returnUrl.hash = new URLSearchParams({ token }).toString();
    try {
      const invoice = await this.monobank.createInvoice({ reservationId: reservation.id, returnUrl: returnUrl.toString() });
      await this.repository.savePublicBookingInvoice(reservation.id, invoice.invoiceId);
      return publicBookingStartResponseSchema.parse({ reservationId: reservation.id, token, paymentUrl: invoice.paymentUrl, expiresAt: reservation.holdExpiresAt });
    } catch (error) {
      await this.repository.failPublicBookingInvoice(reservation.id);
      throw error;
    }
  }

  async status(id: string, token: string | undefined) {
    if (!z.string().uuid().safeParse(id).success || !token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NotFoundException('Reservation not found');
    let reservation = await this.repository.getPublicBookingReservation(id);
    if (!reservation) throw new NotFoundException('Reservation not found');
    const expected = Buffer.from(reservation.tokenHash, 'hex');
    const actual = createHash('sha256').update(token).digest();
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new NotFoundException('Reservation not found');
    reservation = await this.repository.expirePublicBookingReservation(id) ?? reservation;
    const status = reservation.status === 'invoice_pending' ? 'pending_payment'
      : reservation.status === 'calendar_creating' ? 'processing'
        : reservation.status;
    return publicBookingStatusResponseSchema.parse({
      status,
      serviceName: reservation.serviceName,
      durationMinutes: reservation.durationMinutes,
      startAt: reservation.startAt,
      price: reservation.price,
      currency: reservation.currency,
      depositAmount: reservation.depositAmount,
      remainingAmount: reservation.price - reservation.depositAmount,
      ...(reservation.status === 'confirmed' ? { address: studioAddress } : {}),
    });
  }

  async handleMonobankWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!rawBody?.length || !await this.monobank.verifyWebhook(rawBody, signature)) throw new UnauthorizedException('Invalid Monobank webhook signature');
    let payload: unknown;
    try { payload = JSON.parse(rawBody.toString('utf8')); }
    catch { throw new BadRequestException('Invalid Monobank webhook body'); }
    const event = this.parse(monoWebhookSchema, payload);
    const update = await this.repository.applyPublicPaymentUpdate({
      reservationId: event.reference,
      invoiceId: event.invoiceId,
      status: event.status,
      amount: event.amount,
      ...(event.finalAmount === undefined ? {} : { finalAmount: event.finalAmount }),
      currency: event.ccy,
      modifiedAt: new Date(event.modifiedDate).toISOString(),
    });
    const reservation = update.reservation;
    if (!reservation || !update.leaseId) return { ok: true };

    try {
      const available = await this.availability.find({ serviceId: reservation.serviceId, durationMinutes: reservation.durationMinutes, date: localDate(reservation.startAt) }, true, reservation.id);
      if (!available.slots.includes(reservation.startAt)) {
        await this.repository.markPublicBookingManualReview(reservation.id, update.leaseId, 'slot_unavailable');
        return { ok: true };
      }
      const booking = await this.bookings.createPublic({
        id: reservation.id,
        serviceId: reservation.serviceId,
        serviceName: reservation.serviceName,
        durationMinutes: reservation.durationMinutes,
        bufferMinutes: reservation.bufferMinutes,
        price: reservation.price,
        currency: reservation.currency,
        startAt: reservation.startAt,
        endAt: reservation.endAt,
        clientName: reservation.clientName,
        clientContact: reservation.clientContact,
      });
      await this.repository.completePublicBookingCalendarWrite(reservation.id, update.leaseId, booking.id);
    } catch (error) {
      const reason = error instanceof BookingNeedsHumanError ? 'calendar_uncertain' : error instanceof BookingConflictError ? 'slot_unavailable' : 'calendar_uncertain';
      await this.repository.markPublicBookingManualReview(reservation.id, update.leaseId, reason);
    }
    return { ok: true };
  }
}
