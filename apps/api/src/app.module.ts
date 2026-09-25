import { TelegramAccountController } from './telegram-account.controller.js';
import { TelegramAccountService } from './telegram-account.service.js';
import { TelegramAccountStore } from './telegram-account.store.js';
import { TelegramAccountTransport } from './telegram-account.transport.js';
import { OpenAiService } from './openai.service.js';
import { Module } from '@nestjs/common';
import { AssistantToolsService } from './assistant-tools.service.js'; import { AdminAuthService, AdminGuard, AdminOwnerGuard } from './auth.js'; import { AvailabilityService } from './availability.service.js'; import { BookingService } from './booking.service.js'; import { CalendarService } from './calendar.js'; import { AdminController, HealthController, TelegramController } from './controllers.js'; import { FirebaseAdminService } from './firebase-admin.js'; import { BookingRepository } from './repository.js'; import { ServicePhotoService } from './service-photo.service.js'; import { SpecService } from './spec.service.js'; import { TelegramService } from './telegram.service.js';
@Module({ controllers: [TelegramAccountController, HealthController, TelegramController, AdminController], providers: [TelegramAccountService, TelegramAccountStore, TelegramAccountTransport, OpenAiService, FirebaseAdminService, AdminAuthService, AdminGuard, AdminOwnerGuard, BookingRepository, CalendarService, BookingService, AvailabilityService, TelegramService, AssistantToolsService, ServicePhotoService, SpecService] }) export class AppModule {}
