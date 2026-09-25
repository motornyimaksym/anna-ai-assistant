import { BadRequestException, Body, Controller, Delete, Get, Header, Post, Req, UseGuards } from '@nestjs/common';
import { telegramAccountCodeSchema, telegramAccountPasswordSchema, telegramAccountStartSchema } from '@booking/contracts';
import type { ZodType } from 'zod';
import { AdminGuard, AdminOwnerGuard, type AdminRequest } from './auth.js';
import { TelegramAccountService } from './telegram-account.service.js';
const parse = <T>(schema: ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException('Invalid Telegram login input.');
  return result.data;
};
@UseGuards(AdminGuard, AdminOwnerGuard)
@Controller('admin/telegram-account')
export class TelegramAccountController {
  constructor(private readonly account: TelegramAccountService) {}
  @Get() @Header('Cache-Control', 'no-store')
  status(@Req() req: AdminRequest) { return this.account.status(req.admin!.uid); }
  @Post('start') @Header('Cache-Control', 'no-store')
  start(@Req() req: AdminRequest, @Body() body: unknown) { return this.account.run(req.admin!.uid, 'start', parse(telegramAccountStartSchema, body).phone); }
  @Post('code') @Header('Cache-Control', 'no-store')
  code(@Req() req: AdminRequest, @Body() body: unknown) { return this.account.run(req.admin!.uid, 'code', parse(telegramAccountCodeSchema, body).code); }
  @Post('password') @Header('Cache-Control', 'no-store')
  password(@Req() req: AdminRequest, @Body() body: unknown) { return this.account.run(req.admin!.uid, 'password', parse(telegramAccountPasswordSchema, body).password); }
  @Post('check') @Header('Cache-Control', 'no-store')
  check(@Req() req: AdminRequest) { return this.account.run(req.admin!.uid, 'check'); }
  @Delete() @Header('Cache-Control', 'no-store')
  disconnect(@Req() req: AdminRequest) { return this.account.run(req.admin!.uid, 'disconnect'); }
}
