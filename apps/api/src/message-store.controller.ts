import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ZodError } from 'zod';
import { AdminGuard } from './auth.js';
import { MessageStoreService } from './message-store.service.js';

@UseGuards(AdminGuard)
@Controller('admin/message-store')
export class MessageStoreController {
  constructor(private readonly messages: MessageStoreService) {}

  @Get() list() { return this.messages.list(); }
  @Post() create(@Body() body: unknown) { return this.validate(() => this.messages.create(body)); }
  @Post('import-starters') importStarters() { return this.messages.importStarters(); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: unknown) { return this.validate(() => this.messages.update(id, body)); }
  @Delete(':id') delete(@Param('id') id: string) { return this.validate(() => this.messages.delete(id)); }

  private async validate<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); }
    catch (error) {
      if (error instanceof ZodError) throw new BadRequestException('Invalid saved message');
      throw error;
    }
  }
}
