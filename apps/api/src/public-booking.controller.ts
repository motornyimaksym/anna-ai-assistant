import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { PublicBookingService } from './public-booking.service.js';

@Controller('public/booking')
export class PublicBookingController {
  constructor(private readonly booking: PublicBookingService) {}

  @Get('services')
  @Header('Cache-Control', 'no-store')
  services() { return this.booking.services(); }

  @Post('slots')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  slots(@Body() body: unknown) { return this.booking.slots(body); }

  @Post('reservations')
  @Header('Cache-Control', 'no-store')
  start(@Body() body: unknown) { return this.booking.start(body); }

  @Get('reservations/:id')
  @Header('Cache-Control', 'no-store')
  status(@Param('id') id: string, @Headers('x-reservation-token') token?: string) { return this.booking.status(id, token); }

  @Post('monobank-webhook')
  @HttpCode(200)
  async monobankWebhook(@Req() request: RawBodyRequest<IncomingMessage>, @Headers('x-sign') signature?: string) {
    if (!request.rawBody) throw new BadRequestException('Missing raw request body');
    return this.booking.handleMonobankWebhook(request.rawBody, signature);
  }
}
