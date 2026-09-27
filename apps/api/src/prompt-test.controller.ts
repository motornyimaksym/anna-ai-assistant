import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AdminDebugGuard, AdminGuard } from './auth.js';
import { PromptTestService } from './prompt-test.service.js';

@Controller('admin/debug')
@UseGuards(AdminGuard, AdminDebugGuard)
export class PromptTestController {
  constructor(private readonly tester: PromptTestService) {}
  @Post('prompt-test') run(@Body() body: unknown) { return this.tester.run(body); }
}
