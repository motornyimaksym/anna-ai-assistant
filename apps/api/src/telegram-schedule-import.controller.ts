import { BadRequestException, Body, Controller, Get, Header, Post, Put, Query, UseGuards } from '@nestjs/common';
import { telegramScheduleSourceSchema, telegramScheduleTopicsQuerySchema } from '@booking/contracts';
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

  @Get('source-topics') @UseGuards(AdminOwnerGuard) @Header('Cache-Control', 'no-store')
  sourceTopics(@Query() query: unknown) {
    const parsed = telegramScheduleTopicsQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Select a valid Telegram group and topic search.');
    return this.scheduleImport.listSourceTopics(parsed.data.chatId, parsed.data.q);
  }

  @Put('source') @UseGuards(AdminOwnerGuard) @Header('Cache-Control', 'no-store')
  selectSource(@Body() body: unknown) {
    const parsed = telegramScheduleSourceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Select a valid Telegram chat.');
    return this.scheduleImport.selectSource(parsed.data.chatId, parsed.data.topicId);
  }

  @Post('refresh') @Header('Cache-Control', 'no-store')
  refresh(@Body() body: unknown) {
    const parsed = z.object({ retryTransient: z.boolean().optional() }).strict().safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('Refresh accepts only the Settings retry option.');
    return this.scheduleImport.refresh(parsed.data.retryTransient ?? false);
  }
}
