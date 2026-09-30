import { systemOneSettingsSchema } from '@booking/contracts';
import { Body, Controller, Delete, Get, Header, Headers, HttpCode, NotFoundException, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { adminAccessResponseSchema, assistantPromptResponseSchema, clearConversationContextResponseSchema, debugClearResponseSchema, promptCatalogResponseSchema, availabilityRuleSchema, availableSlotsRequestSchema, botSettingsResponseSchema, patchConversationSchema, scheduleExceptionSchema, servicePhotoUploadSchema, serviceSchema, serviceDeleteResponseSchema, updateAdminAccessSchema, updateAssistantPromptSchema, updateBotSettingsSchema, knowledgeBaseResponseSchema, updateKnowledgeBaseSchema, humanAssistanceSettingsResponseSchema, humanReplySchema, updateHumanAssistanceSettingsSchema } from '@booking/contracts';
import { AdminGuard, AdminOwnerGuard, AdminDebugGuard, canViewDebug, type AdminRequest } from './auth.js'; import { AvailabilityService } from './availability.service.js'; import { BookingService } from './booking.service.js'; import { BookingRepository } from './repository.js'; import { SpecService } from './spec.service.js'; import { TelegramService } from './telegram.service.js';
import { getDefaultBotSettings } from './bot-settings.js';
import { DEFAULT_KNOWLEDGE_BASE } from './default-knowledge-base.js';
import { ServicePhotoService } from './service-photo.service.js';
import { HumanAssistanceService } from './human-assistance.service.js';
import { assistantPromptIdSchema } from '@booking/contracts';
import { promptDefinitions } from './prompt-settings.js';
@Controller()
export class HealthController { @Get('health') health() { return { status: 'ok' }; } }
@Controller('telegram')
export class TelegramController { constructor(private readonly telegram: TelegramService) {} @Post('webhook') @HttpCode(200) async webhook(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() body: unknown) { await this.telegram.handle(secret, body); return { ok: true }; } }
@UseGuards(AdminGuard) @Controller('admin')
export class AdminController {
  constructor(private readonly repository: BookingRepository, private readonly bookings: BookingService, private readonly availability: AvailabilityService, private readonly specService: SpecService, private readonly servicePhotos: ServicePhotoService, private readonly human: HumanAssistanceService) {}
  @Get('spec') spec() { return this.specService.getSpec(); }
  @Get('prompt-catalog') promptCatalog() { return promptCatalogResponseSchema.parse({
    systemOne: [
      ...(['handoff'] as const).map((id) => ({ id, label: promptDefinitions[id].label, description: promptDefinitions[id].description, content: promptDefinitions[id].defaultPrompt })),
    ],
    systemTwo: (['assistant'] as const).map((id) => ({ id, label: promptDefinitions[id].label, description: promptDefinitions[id].description, content: promptDefinitions[id].defaultPrompt })),
  }); }
  @Get('prompts/:id') async promptById(@Param('id') rawId: string) {
    const id = assistantPromptIdSchema.parse(rawId);
    const override = await this.repository.getPromptOverride(id);
    return assistantPromptResponseSchema.parse(override ? { ...override, isCustom: true } : { prompt: promptDefinitions[id].defaultPrompt, isCustom: false });
  }
  @Put('prompts/:id') async updatePromptById(@Param('id') rawId: string, @Body() body: unknown) {
    const id = assistantPromptIdSchema.parse(rawId);
    const override = await this.repository.savePromptOverride(id, updateAssistantPromptSchema.parse(body).prompt);
    return assistantPromptResponseSchema.parse({ ...override, isCustom: true });
  }
  @Delete('prompts/:id') async resetPromptById(@Param('id') rawId: string) {
    const id = assistantPromptIdSchema.parse(rawId);
    await this.repository.deletePromptOverride(id);
    return assistantPromptResponseSchema.parse({ prompt: promptDefinitions[id].defaultPrompt, isCustom: false });
  }
  @Get('debug/access') @Header('Cache-Control', 'no-store') debugAccess(@Req() request: AdminRequest) { return { canView: canViewDebug(request.admin) }; }
  @Get('debug/logs') @Header('Cache-Control', 'no-store') @UseGuards(AdminDebugGuard) debugLogs() { return this.repository.listDebugEvents(); }
  @Delete('debug/logs') @Header('Cache-Control', 'no-store') @UseGuards(AdminDebugGuard) async clearDebugLogs() { await this.repository.clearDebugEvents(); return debugClearResponseSchema.parse({ ok: true }); }
  @Get('debug/logs/:id/payload') @Header('Cache-Control', 'no-store') @UseGuards(AdminDebugGuard) debugLogPayload(@Param('id') id: string) { return this.repository.getDebugPayload(id); }
  @Get('knowledge-base') async knowledgeBase() { const [override, services] = await Promise.all([this.repository.getKnowledgeBaseOverride(), this.repository.listServices()]); return this.knowledgeBaseResponse(override, services.filter((service) => service.enabled)); }
  @Put('knowledge-base') async updateKnowledgeBase(@Body() body: unknown) { const { content } = updateKnowledgeBaseSchema.parse(body); const [override, services] = await Promise.all([this.repository.saveKnowledgeBaseOverride(content), this.repository.listServices()]); return this.knowledgeBaseResponse(override, services.filter((service) => service.enabled)); }
  @Delete('knowledge-base') async resetKnowledgeBase() { await this.repository.deleteKnowledgeBaseOverride(); return this.knowledgeBaseResponse(undefined, (await this.repository.listServices()).filter((service) => service.enabled)); }
  @Get('system-one-settings') async systemOneSettings() { return systemOneSettingsSchema.parse(await this.repository.getSystemOneSettings()); }
  @Put('system-one-settings') async updateSystemOneSettings(@Body() body: unknown) { return systemOneSettingsSchema.parse(await this.repository.saveSystemOneSettings(systemOneSettingsSchema.parse(body))); }
  @Get('bot-settings') async botSettings() { return this.botSettingsResponse(await this.repository.getBotSettingsOverride()); }
  @Put('bot-settings') async updateBotSettings(@Body() body: unknown) { const settings = updateBotSettingsSchema.parse(body); return this.botSettingsResponse(await this.repository.saveBotSettingsOverride(settings)); }
  @Get('human-assistance-settings') async humanAssistanceSettings() { return humanAssistanceSettingsResponseSchema.parse(await this.human.settingsView()); }
  @Put('human-assistance-settings') async updateHumanAssistanceSettings(@Body() body: unknown) { await this.human.saveSettings(updateHumanAssistanceSettingsSchema.parse(body)); return this.humanAssistanceSettings(); }
  @Get('human-requests') humanRequests() { return this.human.listOpen(); }
  @Post('human-requests/:id/reply') replyHumanRequest(@Param('id') id: string, @Body() body: unknown, @Req() request: AdminRequest) { return this.human.reply(id, humanReplySchema.parse(body).text, `admin:${request.admin!.uid}`); }
  @Post('human-requests/:id/release') releaseHumanRequest(@Param('id') id: string, @Req() request: AdminRequest) { return this.human.release(id, `admin:${request.admin!.uid}`); }
  @Get('admin-access') async adminAccess(@Req() request: AdminRequest) { const override = await this.repository.getAdminAccessOverride(); return adminAccessResponseSchema.parse({ emails: override?.emails ?? [], canManage: request.admin?.isOwner ?? false, ...(override?.updatedAt ? { updatedAt: override.updatedAt } : {}) }); }
  @Put('admin-access') @UseGuards(AdminOwnerGuard) async updateAdminAccess(@Body() body: unknown) { const { emails } = updateAdminAccessSchema.parse(body); const saved = await this.repository.saveAdminAccessOverride(emails); return adminAccessResponseSchema.parse({ ...saved, canManage: true }); }
  @Get('dashboard') async dashboard() { const [all, conversations] = await Promise.all([this.bookings.list(), this.repository.listConversations()]); const now = new Date(); const today = now.toISOString().slice(0, 10); const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7); return { bookingsToday: all.filter((booking) => booking.startAt.startsWith(today)).length, bookingsThisWeek: all.filter((booking) => new Date(booking.startAt) >= now && new Date(booking.startAt) <= weekEnd).length, upcomingBookings: all.filter((booking) => new Date(booking.startAt) >= now), assistantEnabled: conversations.every((conversation) => conversation.assistantEnabled), calendarSyncFailures: 0 }; }
  @Get('services') services() { return this.repository.listServices(); }
  @Post('services') createService(@Body() body: unknown) { return this.repository.saveService(serviceSchema.parse(body)); }
  @Patch('services/:id') async patchService(@Param('id') id: string, @Body() body: unknown) { const current = await this.repository.getService(id); const service = serviceSchema.parse({ ...(body as object), id }); const saved = await this.repository.saveService(service); if (current?.photoUrl && current.photoUrl !== saved.photoUrl) await this.servicePhotos.delete(current.photoUrl); return saved; }
  @Delete('services/:id') async deleteService(@Param('id') id: string) { const service = await this.repository.deleteService(id); if (service.photoUrl) await this.servicePhotos.delete(service.photoUrl); return serviceDeleteResponseSchema.parse({ ok: true }); }
  @Post('services/:id/photo') async uploadServicePhoto(@Param('id') id: string, @Body() body: unknown) { const current = await this.repository.getService(id); if (!current) throw new NotFoundException('Service not found'); const { contentType, base64 } = servicePhotoUploadSchema.parse(body); const photoUrl = await this.servicePhotos.upload(id, { contentType, base64 }); try { await this.repository.saveService({ ...current, photoUrl }); } catch (error) { await this.servicePhotos.delete(photoUrl); throw error; } if (current.photoUrl) await this.servicePhotos.delete(current.photoUrl); return { photoUrl }; }
  @Get('schedule') schedule() { return this.repository.getRules(); }
  @Put('schedule') async putSchedule(@Body() body: unknown) { const rules = availabilityRuleSchema.array().parse(body); await this.repository.setRules(rules); return rules; }
  @Get('schedule-exceptions') exceptions() { return this.repository.getExceptions(); }
  @Post('schedule-exceptions') createException(@Body() body: unknown) { return this.repository.saveException(scheduleExceptionSchema.parse(body)); }
  @Patch('schedule-exceptions/:id') patchException(@Param('id') id: string, @Body() body: unknown) { return this.repository.saveException(scheduleExceptionSchema.parse({ ...(body as object), id })); }
  @Delete('schedule-exceptions/:id') async deleteException(@Param('id') id: string) { await this.repository.deleteException(id); return { ok: true }; }
  @Get('conversations') conversations() { return this.repository.listConversations(); }
  @Post('conversations/:id/clear-context') @Header('Cache-Control', 'no-store') async clearConversationContext(@Param('id') id: string) { const result = await this.repository.clearConversationContext(id); if (!result) throw new NotFoundException('Conversation not found'); return clearConversationContextResponseSchema.parse(result); }
  @Patch('conversations/:id') async patchConversation(@Param('id') id: string, @Body() body: unknown) { const changes = patchConversationSchema.parse(body); const existing = await this.repository.getConversation(id); const now = new Date().toISOString(); return this.repository.saveConversation({ ...(existing ?? { telegramChatId: id, assistantEnabled: true, state: 'active', summary: '', createdAt: now }), ...changes, humanTakeoverUntil: changes.humanTakeoverUntil === null ? undefined : changes.humanTakeoverUntil ?? existing?.humanTakeoverUntil, updatedAt: now }); }
  @Post('available-slots') availableSlots(@Body() body: unknown) { return this.availability.find(availableSlotsRequestSchema.parse(body)); }
  private knowledgeBaseResponse(override?: { content: string; updatedAt: string }, services: Awaited<ReturnType<BookingRepository['listServices']>> = []) { return knowledgeBaseResponseSchema.parse({ ...(override ? { ...override, isCustom: true } : { content: DEFAULT_KNOWLEDGE_BASE, isCustom: false }), services: services.map(({ id, name, description, durationMinutes, durationOptions, price, currency }) => ({ id, name, description, durationMinutes, ...(durationOptions ? { durationOptions } : {}), price, currency })) }); }
  private botSettingsResponse(override?: { maxReadDelayMs: number; typingDelayPerSymbolMs: number; testerUsernames: string[]; updatedAt: string }) { return botSettingsResponseSchema.parse(override ? { ...override, isCustom: true } : { ...getDefaultBotSettings(), isCustom: false }); }
}
