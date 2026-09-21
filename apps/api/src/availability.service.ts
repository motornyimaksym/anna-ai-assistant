import { Injectable } from '@nestjs/common';
import type { AvailableSlotsRequest } from '@booking/contracts';
import { ServiceNotFoundError, generateAvailableSlots } from '@booking/domain';
import { CalendarService } from './calendar.js'; import { BookingRepository } from './repository.js';
@Injectable()
export class AvailabilityService { constructor(private readonly repository: BookingRepository, private readonly calendar: CalendarService) {} async find(input: AvailableSlotsRequest) { const service = this.repository.getService(input.serviceId); if (!service || !service.enabled) throw new ServiceNotFoundError(); const start = `${input.date}T00:00:00.000Z`; const end = `${input.date}T23:59:59.999Z`; const busy = await this.calendar.getBusyIntervals(start, end); return { slots: generateAvailableSlots({ ...input, timezone: process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv', service, rules: this.repository.getRules(), exceptions: this.repository.getExceptions(), occupied: this.repository.listLockedIntervals(), busy }) }; } }
