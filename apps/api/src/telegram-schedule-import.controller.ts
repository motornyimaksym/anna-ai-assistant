import { BadRequestException, Body, Controller, Get, Header, Post, Put, UseGuards } from '@nestjs/common';
import { telegramScheduleSourceSchema } from '@booking/contracts';
import { z } from 'zod';
import { AdminGuard, AdminOwnerGuard } from './auth.js';
import { TelegramScheduleImportService } from './telegram-schedule-import.service.js';

@UseGuards(AdminGuard)
@Controller('admin/schedule')
export class TelegramScheduleImportController {
  constructor(private readonly scheduleImport: TelegramScheduleImportService) {}

  @Get('imported-slots') @Header('Cache-Control', 'no-store')
  importedSlots() { return this.scheduleImport.readSnapshot(); }

  @Get('source-chats') @UseGuards(AdminOwnerGuard) @Header('Cache-Control', 'no-store')
  sourceChats() { return this.scheduleImport.listSourceChats(); }

  @Put('source') @UseGuards(AdminOwnerGuard) @Header('Cache-Control', 'no-store')
  selectSource(@Body() body: unknown) {
    const parsed = telegramScheduleSourceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Select a valid Telegram chat.');
    return this.scheduleImport.selectSource(parsed.data.chatId);
  }

  @Post('refresh') @Header('Cache-Control', 'no-store')
  refresh(@Body() body: unknown) {
    if (!z.object({}).strict().safeParse(body ?? {}).success) throw new BadRequestException('Refresh accepts no arguments.');
    return this.scheduleImport.refresh();
  }
}
