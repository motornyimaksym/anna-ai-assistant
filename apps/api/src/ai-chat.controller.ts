import { BadRequestException, Body, Controller, Get, Header, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { aiChatIdSchema, aiChatInputSchema } from '@booking/contracts';
import { AdminGuard, type AdminRequest } from './auth.js';
import { AiChatStore } from './ai-chat.store.js';
import { AiChatService } from './ai-chat.service.js';
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException('Invalid chat request');
  return result.data;
};
@Controller('admin/ai-chat')
@UseGuards(AdminGuard)
export class AiChatController {
  constructor(private readonly store: AiChatStore, private readonly service: AiChatService) {}
  @Get('threads') @Header('Cache-Control', 'no-store')
  list(@Req() req: AdminRequest) { return this.store.list(req.admin!.uid); }
  @Post('threads') @Header('Cache-Control', 'no-store')
  create(@Req() req: AdminRequest, @Body() body: unknown) { parse(z.object({}).strict(), body ?? {}); return this.store.create(req.admin!.uid); }
  @Get('threads/:id') @Header('Cache-Control', 'no-store')
  read(@Req() req: AdminRequest, @Param('id') id: string) { return this.store.read(req.admin!.uid, parse(aiChatIdSchema, id)); }
  @Post('threads/:id/messages') @Header('Cache-Control', 'no-store')
  message(@Req() req: AdminRequest, @Param('id') id: string, @Body() body: unknown) { return this.service.message(req.admin!.uid, parse(aiChatIdSchema, id), parse(aiChatInputSchema, body).text); }
  @Post('threads/:id/actions/:actionId/confirm') @Header('Cache-Control', 'no-store')
  confirm(@Req() req: AdminRequest, @Param('id') id: string, @Param('actionId') actionId: string, @Body() body: unknown) {
    parse(z.object({}).strict(), body ?? {});
    return this.service.action(req.admin!.uid, parse(aiChatIdSchema, id), parse(aiChatIdSchema, actionId), true);
  }
  @Post('threads/:id/actions/:actionId/cancel') @Header('Cache-Control', 'no-store')
  cancel(@Req() req: AdminRequest, @Param('id') id: string, @Param('actionId') actionId: string, @Body() body: unknown) {
    parse(z.object({}).strict(), body ?? {});
    return this.service.action(req.admin!.uid, parse(aiChatIdSchema, id), parse(aiChatIdSchema, actionId), false);
  }
}
