import { BadRequestException, Body, Controller, Delete, Get, Header, Post, Put, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { googleCalendarCompleteSchema, googleCalendarSelectionSchema } from '@booking/contracts';
import { AdminGuard, AdminOwnerGuard, type AdminRequest } from './auth.js';
import { GoogleCalendarConnection } from './google-calendar.connection.js';
const parse = <T>(schema: z.ZodType<T>, body: unknown): T => { const result = schema.safeParse(body); if (!result.success) throw new BadRequestException('Invalid Calendar request'); return result.data; };
@Controller('admin/google-calendar')
@UseGuards(AdminGuard, AdminOwnerGuard)
export class GoogleCalendarController {
  constructor(private readonly connection: GoogleCalendarConnection) {}
  @Get() @Header('Cache-Control', 'no-store') status() { return this.connection.status(); }
  @Post('start') @Header('Cache-Control', 'no-store') start(@Req() req: AdminRequest, @Body() body: unknown) { parse(z.object({}).strict(), body ?? {}); return this.connection.start(req.admin!.uid); }
  @Post('complete') @Header('Cache-Control', 'no-store') complete(@Req() req: AdminRequest, @Body() body: unknown) { return this.connection.complete(req.admin!.uid, parse(googleCalendarCompleteSchema, body)); }
  @Get('calendars') @Header('Cache-Control', 'no-store') calendars() { return this.connection.calendars(); }
  @Put('selection') @Header('Cache-Control', 'no-store') select(@Body() body: unknown) { return this.connection.select(parse(googleCalendarSelectionSchema, body).calendarId); }
  @Post('check') @Header('Cache-Control', 'no-store') check(@Body() body: unknown) { parse(z.object({}).strict(), body ?? {}); return this.connection.check(); }
  @Delete() @Header('Cache-Control', 'no-store') disconnect() { return this.connection.disconnect(); }
}
