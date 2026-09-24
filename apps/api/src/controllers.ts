import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { assistantPromptResponseSchema, availabilityRuleSchema, availableSlotsRequestSchema, botSettingsResponseSchema, createBookingRequestSchema, patchConversationSchema, rescheduleBookingRequestSchema, scheduleExceptionSchema, serviceSchema, updateAssistantPromptSchema, updateBotSettingsSchema, updateBookingRequestSchema } from '@booking/contracts';
import { AdminGuard } from './auth.js'; import { AvailabilityService } from './availability.service.js'; import { BookingService } from './booking.service.js'; import { BookingRepository } from './repository.js'; import { SpecService } from './spec.service.js'; import { TelegramService } from './telegram.service.js'; import { ASSISTANT_SYSTEM_PROMPT } from './assistant-prompt.js';
import { DEFAULT_BOT_SETTINGS } from './bot-settings.js';
@Controller()
export class HealthController { @Get('health') health() { return { status: 'ok' }; } }
@Controller('telegram')
export class TelegramController { constructor(private readonly telegram: TelegramService) {} @Post('webhook') @HttpCode(200) async webhook(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() body: unknown) { await this.telegram.handle(secret, body); return { ok: true }; } }
@UseGuards(AdminGuard) @Controller('admin')
export class AdminController {
  constructor(private readonly repository: BookingRepository, private readonly bookings: BookingService, private readonly availability: AvailabilityService, private readonly specService: SpecService) {}
  @Get('spec') spec() { return this.specService.getSpec(); }
  @Get('assistant-prompt') async assistantPrompt() { return this.promptResponse(await this.repository.getAssistantPromptOverride()); }
  @Put('assistant-prompt') async updateAssistantPrompt(@Body() body: unknown) { const { prompt } = updateAssistantPromptSchema.parse(body); return this.promptResponse(await this.repository.saveAssistantPromptOverride(prompt)); }
  @Delete('assistant-prompt') async resetAssistantPrompt() { await this.repository.deleteAssistantPromptOverride(); return this.promptResponse(); }
  @Get('bot-settings') async botSettings() { return this.botSettingsResponse(await this.repository.getBotSettingsOverride()); }
  @Put('bot-settings') async updateBotSettings(@Body() body: unknown) { const settings = updateBotSettingsSchema.parse(body); return this.botSettingsResponse(await this.repository.saveBotSettingsOverride(settings)); }
  @Get('dashboard') async dashboard() { const [all, conversations] = await Promise.all([this.repository.listBookings(), this.repository.listConversations()]); const now = new Date(); const today = now.toISOString().slice(0, 10); const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7); return { bookingsToday: all.filter((booking) => booking.startAt.startsWith(today)).length, bookingsThisWeek: all.filter((booking) => new Date(booking.startAt) >= now && new Date(booking.startAt) <= weekEnd).length, upcomingBookings: all.filter((booking) => new Date(booking.startAt) >= now), assistantEnabled: conversations.every((conversation) => conversation.assistantEnabled), calendarSyncFailures: all.filter((booking) => booking.calendarSyncStatus === 'failed').length }; }
  @Get('bookings') listBookings() { return this.repository.listBookings(); }
  @Get('bookings/:id') booking(@Param('id') id: string) { return this.repository.getBooking(id); }
  @Post('bookings') createBooking(@Body() body: unknown) { return this.bookings.create(createBookingRequestSchema.parse(body)); }
  @Patch('bookings/:id') patchBooking(@Param('id') id: string, @Body() body: unknown) { const patch = updateBookingRequestSchema.parse(body); return patch.status ? this.repository.updateBookingStatus(id, patch.status) : this.repository.getBooking(id); }
  @Post('bookings/:id/cancel') cancel(@Param('id') id: string) { return this.bookings.cancel(id); }
  @Post('bookings/:id/reschedule') reschedule(@Param('id') id: string, @Body() body: unknown) { return this.bookings.reschedule(id, rescheduleBookingRequestSchema.parse(body)); }
  @Get('services') services() { return this.repository.listServices(); }
  @Post('services') createService(@Body() body: unknown) { return this.repository.saveService(serviceSchema.parse(body)); }
  @Patch('services/:id') patchService(@Param('id') id: string, @Body() body: unknown) { return this.repository.saveService(serviceSchema.parse({ ...(body as object), id })); }
  @Get('schedule') schedule() { return this.repository.getRules(); }
  @Put('schedule') async putSchedule(@Body() body: unknown) { const rules = availabilityRuleSchema.array().parse(body); await this.repository.setRules(rules); return rules; }
  @Get('schedule-exceptions') exceptions() { return this.repository.getExceptions(); }
  @Post('schedule-exceptions') createException(@Body() body: unknown) { return this.repository.saveException(scheduleExceptionSchema.parse(body)); }
  @Patch('schedule-exceptions/:id') patchException(@Param('id') id: string, @Body() body: unknown) { return this.repository.saveException(scheduleExceptionSchema.parse({ ...(body as object), id })); }
  @Delete('schedule-exceptions/:id') async deleteException(@Param('id') id: string) { await this.repository.deleteException(id); return { ok: true }; }
  @Get('conversations') conversations() { return this.repository.listConversations(); }
  @Patch('conversations/:id') async patchConversation(@Param('id') id: string, @Body() body: unknown) { const changes = patchConversationSchema.parse(body); const existing = await this.repository.getConversation(id); const now = new Date().toISOString(); return this.repository.saveConversation({ ...(existing ?? { telegramChatId: id, assistantEnabled: true, state: 'active', summary: '', createdAt: now }), ...changes, humanTakeoverUntil: changes.humanTakeoverUntil === null ? undefined : changes.humanTakeoverUntil ?? existing?.humanTakeoverUntil, updatedAt: now }); }
  @Post('available-slots') availableSlots(@Body() body: unknown) { return this.availability.find(availableSlotsRequestSchema.parse(body)); }
  private promptResponse(override?: { prompt: string; updatedAt: string }) { return assistantPromptResponseSchema.parse(override ? { ...override, isCustom: true } : { prompt: ASSISTANT_SYSTEM_PROMPT, isCustom: false }); }
  private botSettingsResponse(override?: { maxReadDelayMs: number; typingDelayPerSymbolMs: number; updatedAt: string }) { return botSettingsResponseSchema.parse(override ? { ...override, isCustom: true } : { ...DEFAULT_BOT_SETTINGS, isCustom: false }); }
}
