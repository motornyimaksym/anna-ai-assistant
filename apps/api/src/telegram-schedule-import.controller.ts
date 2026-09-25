import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { AdminGuard } from './auth.js';
import { TelegramScheduleImportService } from './telegram-schedule-import.service.js';

@UseGuards(AdminGuard)
@Controller('admin/schedule')
export class TelegramScheduleImportController {
  constructor(private readonly scheduleImport: TelegramScheduleImportService) {}

  @Get('imported-slots') @Header('Cache-Control', 'no-store')
  importedSlots() { return this.scheduleImport.readSnapshot(); }
}
