import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ZodError } from 'zod';
import { AdminGuard } from './auth.js';
import { MediaStoreService } from './media-store.service.js';

@UseGuards(AdminGuard)
@Controller('admin/media')
export class MediaStoreController {
  constructor(private readonly media: MediaStoreService) {}
  @Get() list() { return this.media.list(); }
  @Post() create(@Body() body: unknown) { return this.validate(() => this.media.create(body)); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: unknown) { return this.validate(() => this.media.update(id, body)); }
  @Delete(':id') delete(@Param('id') id: string) { return this.validate(() => this.media.delete(id)); }
  private async validate<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); } catch (error) {
      if (error instanceof ZodError) throw new BadRequestException('Invalid media metadata or file');
      throw error;
    }
  }
}
