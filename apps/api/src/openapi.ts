import { DocumentBuilder, SwaggerModule, type OpenAPIObject, type OperationObject, type ParameterObject, type SchemaObject } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import { z, type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as C from '@booking/contracts';

type RouteDoc = { summary: string; request?: ZodTypeAny; response?: ZodTypeAny; note?: string; requestRequired?: boolean };
const route = (summary: string, response?: ZodTypeAny, request?: ZodTypeAny, note?: string, requestRequired = true): RouteDoc => ({ summary, response, request, note, requestRequired });
const ok = z.object({ ok: z.literal(true) });
const empty = z.object({}).strict();
const webhook = z.object({ update_id: z.number().int() }).passthrough();
const dashboard = z.object({ bookingsToday: z.number(), bookingsThisWeek: z.number(), upcomingBookings: C.bookingSchema.array(), assistantEnabled: z.boolean(), calendarSyncFailures: z.number() });
const sourceRefresh = z.object({ retryTransient: z.boolean().optional() }).strict();
const serviceUpdate = C.serviceSchema.innerType().omit({ id: true }).extend({ id: z.string().optional() });
const exceptionUpdate = C.scheduleExceptionSchema.innerType().omit({ id: true }).extend({ id: z.string().optional() });

/** Deliberately explicit: a new Nest route requires a documentation entry. */
const routes: Record<string, RouteDoc> = {
  'GET /health': route('Check API health', z.object({ status: z.literal('ok') })),
  'POST /telegram/webhook': route('Receive a Telegram update', ok, webhook, 'Requires the Telegram webhook secret header. Successful responses acknowledge ignored or duplicate updates too.'),

  'GET /admin/spec': route('Read the current product specification', C.specResponseSchema),
  'GET /admin/prompt-catalog': route('List editable assistant prompts', C.promptCatalogResponseSchema),
  'GET /admin/prompts/{id}': route('Read an assistant prompt', C.assistantPromptResponseSchema),
  'PUT /admin/prompts/{id}': route('Save an assistant prompt', C.assistantPromptResponseSchema, C.updateAssistantPromptSchema),
  'DELETE /admin/prompts/{id}': route('Reset an assistant prompt', C.assistantPromptResponseSchema),
  'GET /admin/debug/access': route('Check diagnostic access', C.debugAccessSchema),
  'GET /admin/debug/logs': route('List diagnostic events', C.debugEventsSchema),
  'DELETE /admin/debug/logs': route('Clear diagnostic events', C.debugClearResponseSchema),
  'GET /admin/debug/logs/{id}/payload': route('Read a private diagnostic payload', C.debugPayloadSchema),
  'POST /admin/debug/prompt-test': route('Run an isolated prompt test', C.promptTestResponseSchema, C.promptTestRequestSchema, 'The test does not execute returned tool calls.'),
  'GET /admin/knowledge-base': route('Read the effective knowledge base', C.knowledgeBaseResponseSchema),
  'PUT /admin/knowledge-base': route('Save the knowledge base', C.knowledgeBaseResponseSchema, C.updateKnowledgeBaseSchema),
  'DELETE /admin/knowledge-base': route('Reset the knowledge base', C.knowledgeBaseResponseSchema),
  'GET /admin/system-one-settings': route('Read System One provider settings', C.systemOneSettingsSchema),
  'PUT /admin/system-one-settings': route('Select the System One provider', C.systemOneSettingsSchema, C.systemOneSettingsSchema),
  'GET /admin/bot-settings': route('Read bot timing settings', C.botSettingsResponseSchema),
  'PUT /admin/bot-settings': route('Update bot timing settings', C.botSettingsResponseSchema, C.updateBotSettingsSchema),
  'GET /admin/human-assistance-settings': route('Read human assistance settings', C.humanAssistanceSettingsResponseSchema),
  'PUT /admin/human-assistance-settings': route('Update human assistance settings', C.humanAssistanceSettingsResponseSchema, C.updateHumanAssistanceSettingsSchema),
  'GET /admin/human-requests': route('List open human assistance requests', C.humanRequestSchema.array()),
  'POST /admin/human-requests/{id}/reply': route('Reply to a human assistance request', C.humanRequestSchema, C.humanReplySchema, 'Sends a Telegram message to the client.'),
  'POST /admin/human-requests/{id}/release': route('Release a human assistance request', C.humanReleaseResponseSchema),
  'GET /admin/admin-access': route('Read administrator access', C.adminAccessResponseSchema),
  'PUT /admin/admin-access': route('Update administrator access', C.adminAccessResponseSchema, C.updateAdminAccessSchema),
  'GET /admin/dashboard': route('Read dashboard statistics', dashboard),
  'GET /admin/services': route('List services', C.serviceSchema.array()),
  'POST /admin/services': route('Create a service', C.serviceSchema, C.serviceSchema),
  'PATCH /admin/services/{id}': route('Replace a service', C.serviceSchema, serviceUpdate, 'The path ID overrides any ID in the JSON body. Supply the complete service definition.'),
  'DELETE /admin/services/{id}': route('Delete a service', C.serviceDeleteResponseSchema),
  'POST /admin/services/{id}/photo': route('Upload a service photo', C.servicePhotoUploadResponseSchema, C.servicePhotoUploadSchema, 'Send base64 JSON; this is not multipart upload.'),
  'GET /admin/schedule': route('List weekly availability rules', C.availabilityRuleSchema.array()),
  'PUT /admin/schedule': route('Replace weekly availability rules', C.availabilityRuleSchema.array(), C.availabilityRuleSchema.array()),
  'GET /admin/schedule-exceptions': route('List schedule exceptions', C.scheduleExceptionSchema.array()),
  'POST /admin/schedule-exceptions': route('Create a schedule exception', C.scheduleExceptionSchema, C.scheduleExceptionSchema),
  'PATCH /admin/schedule-exceptions/{id}': route('Replace a schedule exception', C.scheduleExceptionSchema, exceptionUpdate, 'The path ID overrides any ID in the JSON body.'),
  'DELETE /admin/schedule-exceptions/{id}': route('Delete a schedule exception', ok),
  'GET /admin/conversations': route('List conversations', C.conversationSchema.array()),
  'POST /admin/conversations/{id}/clear-context': route('Clear conversation context', C.clearConversationContextResponseSchema),
  'PATCH /admin/conversations/{id}': route('Change conversation automation', C.conversationSchema, C.patchConversationSchema),
  'POST /admin/available-slots': route('Find available slots', C.availableSlotsResponseSchema, C.availableSlotsRequestSchema),

  'GET /admin/schedule/imported-slots': route('Read imported Telegram schedule', C.telegramScheduleSlotsResponseSchema),
  'GET /admin/schedule/source-chats': route('List Telegram schedule source chats', C.telegramScheduleChatsSchema),
  'GET /admin/schedule/source-topics': route('List or search source chat topics', C.telegramScheduleTopicsSchema),
  'PUT /admin/schedule/source': route('Select a Telegram schedule source', C.telegramScheduleSlotsResponseSchema, C.telegramScheduleSourceSchema),
  'POST /admin/schedule/refresh': route('Refresh the imported schedule', C.telegramScheduleSlotsResponseSchema, sourceRefresh, undefined, false),
  'GET /admin/media': route('List media items', C.mediaSchema.array()),
  'POST /admin/media': route('Upload a media item', C.mediaSchema, C.createMediaSchema, 'Send a base64 file in JSON; this is not multipart upload.'),
  'PATCH /admin/media/{id}': route('Update a media item', C.mediaSchema, C.updateMediaSchema),
  'DELETE /admin/media/{id}': route('Delete a media item', C.mediaDeleteResponseSchema),

  'GET /admin/ai-chat/threads': route('List AI workspace threads', C.aiChatSummarySchema.array()),
  'POST /admin/ai-chat/threads': route('Create an AI workspace thread', C.aiChatThreadSchema, empty, undefined, false),
  'GET /admin/ai-chat/threads/{id}': route('Read an AI workspace thread', C.aiChatThreadSchema),
  'POST /admin/ai-chat/threads/{id}/messages': route('Send an AI workspace message', C.aiChatThreadSchema, C.aiChatInputSchema),
  'POST /admin/ai-chat/threads/{id}/actions/{actionId}/confirm': route('Confirm a proposed Telegram action', C.aiChatThreadSchema, empty, undefined, false),
  'POST /admin/ai-chat/threads/{id}/actions/{actionId}/cancel': route('Cancel a proposed Telegram action', C.aiChatThreadSchema, empty, undefined, false),

  'GET /admin/google-calendar': route('Read Google Calendar connection status', C.googleCalendarStatusSchema),
  'POST /admin/google-calendar/start': route('Start Google Calendar authorization', C.googleCalendarStartSchema, empty, undefined, false),
  'POST /admin/google-calendar/complete': route('Complete Google Calendar authorization', C.googleCalendarStatusSchema, C.googleCalendarCompleteSchema),
  'GET /admin/google-calendar/calendars': route('List accessible Google calendars', C.googleCalendarListSchema),
  'PUT /admin/google-calendar/selection': route('Select the booking calendar', C.googleCalendarStatusSchema, C.googleCalendarSelectionSchema),
  'PUT /admin/google-calendar/conflicts': route('Select conflict calendars', C.googleCalendarStatusSchema, C.googleCalendarConflictsSchema),
  'POST /admin/google-calendar/check': route('Check Calendar permissions', C.googleCalendarStatusSchema, empty, undefined, false),
  'DELETE /admin/google-calendar': route('Disconnect Google Calendar', C.googleCalendarStatusSchema),

  'GET /admin/telegram-account': route('Read Telegram account connection status', C.telegramAccountStatusSchema),
  'POST /admin/telegram-account/start': route('Start Telegram account sign-in', C.telegramAccountStatusSchema, C.telegramAccountStartSchema),
  'POST /admin/telegram-account/code': route('Submit Telegram login code', C.telegramAccountStatusSchema, C.telegramAccountCodeSchema),
  'POST /admin/telegram-account/password': route('Submit Telegram two-step password', C.telegramAccountStatusSchema, C.telegramAccountPasswordSchema),
  'POST /admin/telegram-account/check': route('Check Telegram account connection', C.telegramAccountStatusSchema),
  'DELETE /admin/telegram-account': route('Disconnect Telegram account', C.telegramAccountStatusSchema),
};

const schemaOf = (value: ZodTypeAny): SchemaObject => zodToJsonSchema(value, { target: 'openApi3', $refStrategy: 'none' }) as SchemaObject;
const methodKeys = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const ownerOnly = (key: string): boolean => /^\w+ \/admin\/(?:google-calendar|telegram-account)(?:\/|$)/.test(key)
  || /^\w+ \/admin\/schedule\/source(?:-chats|-topics)?$/.test(key)
  || key === 'PUT /admin/admin-access';
const debugOnly = (key: string): boolean => /^\w+ \/admin\/debug\/(?:logs|prompt-test)(?:\/|$)/.test(key);
const tagFor = (path: string): string => {
  if (path === '/health') return 'Health';
  if (path.startsWith('/telegram/')) return 'Telegram webhook';
  if (path.startsWith('/admin/ai-chat/')) return 'AI workspace';
  if (path.startsWith('/admin/google-calendar')) return 'Google Calendar';
  if (path.startsWith('/admin/telegram-account')) return 'Telegram account';
  if (path.startsWith('/admin/schedule/')) return 'Schedule import';
  if (path.startsWith('/admin/debug/')) return 'Diagnostics';
  if (path.startsWith('/admin/media')) return 'Media';
  if (path.startsWith('/admin/services')) return 'Services';
  if (path.startsWith('/admin/schedule')) return 'Schedule';
  if (path.startsWith('/admin/conversations') || path.startsWith('/admin/human-')) return 'Conversations';
  if (path.startsWith('/admin/prompts') || path.startsWith('/admin/prompt-') || path.startsWith('/admin/knowledge-base')) return 'Assistant content';
  return 'Administration';
};

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Telegram Booking Assistant API')
    .setDescription('HTTP API for the massage booking assistant. Admin endpoints require a Firebase ID token. Documentation contains no live data.')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'Firebase ID token' }, 'firebaseBearer')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Telegram-Bot-Api-Secret-Token' }, 'telegramWebhookSecret')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.servers = [{ url: '/', description: 'Direct function or local API' }, { url: '/api', description: 'Firebase Hosting' }];
  const seen = new Set<string>();
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!methodKeys.has(method)) continue;
      const key = `${method.toUpperCase()} ${path}`;
      const details = routes[key];
      if (!details) throw new Error(`Missing OpenAPI documentation for ${key}`);
      seen.add(key);
      const operation = rawOperation as OperationObject;
      operation.summary = details.summary;
      operation.tags = [tagFor(path)];
      operation.description = [details.note, ownerOnly(key) ? 'Owner access required.' : undefined, debugOnly(key) ? 'Designated debug owner access required.' : undefined].filter(Boolean).join(' ');
      operation.security = path.startsWith('/admin/') ? [{ firebaseBearer: [] }] : path === '/telegram/webhook' ? [{ telegramWebhookSecret: [] }] : [];
      const parameters = (operation.parameters ?? []).filter((parameter): parameter is ParameterObject => !('$ref' in parameter));
      for (const name of [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]!)) {
        if (!parameters.some((parameter) => parameter.in === 'path' && parameter.name === name)) parameters.push({ in: 'path', name, required: true, schema: { type: 'string' } });
      }
      if (key === 'GET /admin/schedule/source-topics') {
        parameters.push({ in: 'query', name: 'chatId', required: true, schema: { type: 'string' }, description: 'Numeric Telegram chat ID.' });
        parameters.push({ in: 'query', name: 'q', required: false, schema: { type: 'string', maxLength: 128 }, description: 'Optional topic search text.' });
      }
      operation.parameters = parameters;
      if (details.request) operation.requestBody = { required: details.requestRequired, content: { 'application/json': { schema: schemaOf(details.request) } } };
      else delete operation.requestBody;
      const status = method === 'post' && path !== '/telegram/webhook' ? '201' : '200';
      operation.responses = { [status]: { description: details.response ? 'Successful response.' : details.note ?? 'Successful response.', ...(details.response ? { content: { 'application/json': { schema: schemaOf(details.response) } } } : {}) }, ...(path.startsWith('/admin/') ? { '401': { description: 'Missing or invalid Firebase ID token.' }, '403': { description: 'Insufficient administrator privileges.' } } : {}) };
    }
  }
  const stale = Object.keys(routes).filter((key) => !seen.has(key));
  if (stale.length) throw new Error(`OpenAPI documentation references missing routes: ${stale.join(', ')}`);
  return document;
}

export function setupOpenApi(app: INestApplication): void {
  app.use((request: { path: string }, response: { redirect: (status: number, url: string) => void }, next: () => void) => {
    if (request.path === '/docs') response.redirect(308, 'docs/');
    else next();
  });
  const documentFactory = () => buildOpenApiDocument(app);
  SwaggerModule.setup('docs', app, documentFactory, {
    jsonDocumentUrl: 'docs/openapi.json', swaggerUrl: 'openapi.json', raw: ['json'],
    patchDocumentOnRequest: (rawRequest, _response, document) => {
      const request = rawRequest as { headers?: Record<string, string | undefined> };
      const host = (request.headers?.['x-forwarded-host'] ?? request.headers?.host)?.split(':')[0]?.toLowerCase() ?? '';
      const servers = document.servers ?? [];
      return host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')
        ? { ...document, servers: [servers[1]!, servers[0]!] }
        : document;
    },
  });
}
