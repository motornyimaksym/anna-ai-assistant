import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { OpenAPIObject, OperationObject, ParameterObject, SchemaObject } from '@nestjs/swagger';
import { UnauthorizedException } from '@nestjs/common';
import { createApp } from '../src/main.js';
import { buildOpenApiDocument } from '../src/openapi.js';
import { AdminAuthService } from '../src/auth.js';

let app: NestExpressApplication;
let document: OpenAPIObject;
let origin: string;
const operation = (path: string, method: string) => document.paths[path]?.[method as keyof typeof document.paths[string]] as OperationObject;
const schema = (path: string, method: string, status: string): SchemaObject => {
  const response = operation(path, method).responses[status];
  if (!response || '$ref' in response) throw new Error('Missing response');
  return response.content?.['application/json']?.schema as SchemaObject;
};

beforeAll(async () => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'swagger-test-secret');
  vi.stubEnv('FIREBASE_PROJECT_ID', 'swagger-test-project');
  if (!getApps().length) initializeApp({ projectId: 'swagger-test-project' });
  app = await createApp();
  vi.spyOn(app.get(AdminAuthService), 'verify').mockImplementation(async (token) => {
    if (token === 'Bearer swagger-admin-token') return { uid: 'admin-owner', isOwner: true };
    if (token === 'Bearer swagger-stakeholder-token') return { uid: 'admin-stakeholder', email: 'stakeholder@example.com', isOwner: false };
    throw new UnauthorizedException();
  });
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
  document = buildOpenApiDocument(app);
});
afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });

describe('Swagger documentation', () => {
  it('blocks UI, JSON and UI assets without administrator auth', async () => {
    const paths = ['/docs', '/docs/', '/docs/openapi.json', '/docs/swagger-ui.css', '/docs/swagger-ui-init.js'];
    const responses = await Promise.all(paths.map((path) => fetch(`${origin}${path}`, { redirect: 'manual' })));
    expect(responses.map((response) => response.status)).toEqual(paths.map(() => 401));
    expect(responses.every((response) => response.headers.get('cache-control') === 'private, no-store')).toBe(true);
  });

  it('serves interactive UI, JSON and UI assets to authorized admins', async () => {
    const headers = { authorization: 'Bearer swagger-admin-token' };
    const redirect = await fetch(`${origin}/docs`, { redirect: 'manual', headers });
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get('location')).toBe('docs/');
    expect(new URL('docs/', 'https://anna-ai-assistant.web.app/api/docs').pathname).toBe('/api/docs/');
    const [ui, json, css, initializer] = await Promise.all([
      fetch(`${origin}/docs/`, { headers }), fetch(`${origin}/docs/openapi.json`, { headers }), fetch(`${origin}/docs/swagger-ui.css`, { headers }), fetch(`${origin}/docs/swagger-ui-init.js`, { headers }),
    ]);
    expect(ui.status).toBe(200);
    expect(ui.headers.get('cache-control')).toBe('private, no-store');
    expect(await ui.text()).toContain('Swagger UI');
    expect(json.status).toBe(200);
    const directDocument = await json.json() as OpenAPIObject;
    expect(directDocument.paths['/telegram/webhook']).toBeDefined();
    expect(directDocument.servers?.[0]?.url).toBe('/');
    const hosted = await fetch(`${origin}/docs/openapi.json`, { headers: { ...headers, 'x-forwarded-host': 'anna-ai-assistant.web.app' } });
    expect((await hosted.json() as OpenAPIObject).servers?.[0]?.url).toBe('/api');
    const stakeholderDocument = await fetch(`${origin}/docs/openapi.json`, { headers: { authorization: 'Bearer swagger-stakeholder-token' } });
    expect(stakeholderDocument.status).toBe(200);
    expect(css.status).toBe(200);
    expect(initializer.status).toBe(200);
    expect(await initializer.text()).toContain('openapi.json');
  });

  it('issues a scoped docs cookie only for authorized admins and clears it safely', async () => {
    const bootstrap = await fetch(`${origin}/docs/session`, {
      method: 'POST',
      headers: { authorization: 'Bearer swagger-admin-token' },
    });
    expect(bootstrap.status).toBe(204);
    expect(bootstrap.headers.get('cache-control')).toBe('private, no-store');
    const cookie = bootstrap.headers.get('set-cookie');
    expect(cookie).toContain('admin_docs_session=swagger-admin-token');
    expect(cookie).toContain('Path=/api/docs');
    expect(cookie).toContain('Max-Age=3600');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    const cookieHeader = cookie!.split(';')[0]!;
    const cookieDocument = await fetch(`${origin}/docs/openapi.json`, { headers: { cookie: cookieHeader } });
    expect(cookieDocument.status).toBe(200);

    const secureBootstrap = await fetch(`${origin}/docs/session`, {
      method: 'POST',
      headers: { authorization: 'Bearer swagger-admin-token', 'x-forwarded-host': 'anna-ai-assistant.web.app' },
    });
    expect(secureBootstrap.headers.get('set-cookie')).toContain('Secure');

    const invalid = await fetch(`${origin}/docs/session`, {
      method: 'POST',
      headers: { authorization: 'Bearer not-an-admin-token' },
    });
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get('set-cookie')).toContain('Max-Age=0');

    const signOut = await fetch(`${origin}/docs/session`, { method: 'DELETE' });
    expect(signOut.status).toBe(204);
    expect(signOut.headers.get('set-cookie')).toContain('Path=/api/docs');
    expect(signOut.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('documents all registered controller methods and both API prefixes', () => {
    const methods = Object.values(document.paths).flatMap((item) => Object.keys(item).filter((key) => ['get', 'post', 'put', 'patch', 'delete'].includes(key)));
    expect(methods.length).toBeGreaterThan(65);
    expect(document.servers?.map(({ url }) => url)).toEqual(['/', '/api']);
    expect(operation('/health', 'get').summary).toBe('Check API health');
    expect(operation('/admin/ai-chat/threads/{id}/actions/{actionId}/confirm', 'post').summary).toContain('Confirm');
  });

  it('reuses Zod request and response shapes', () => {
    const createService = operation('/admin/services', 'post');
    const serviceRequest = createService.requestBody;
    if (!serviceRequest || '$ref' in serviceRequest) throw new Error('Missing service request');
    const serviceSchema = serviceRequest.content['application/json']?.schema as SchemaObject;
    expect((serviceSchema.properties as Record<string, unknown>).durationOptions).toBeDefined();
    expect(serviceSchema.required).toContain('name');
    const updateBody = operation('/admin/services/{id}', 'patch').requestBody;
    if (!updateBody || '$ref' in updateBody) throw new Error('Missing update body');
    expect((updateBody.content['application/json']?.schema as SchemaObject).required).not.toContain('id');
    const refreshBody = operation('/admin/schedule/refresh', 'post').requestBody;
    if (!refreshBody || '$ref' in refreshBody) throw new Error('Missing refresh body');
    expect(refreshBody.required).toBe(false);
    expect((schema('/admin/services', 'get', '200').items as SchemaObject).properties).toHaveProperty('price');
    const slotsRequest = operation('/admin/available-slots', 'post').requestBody;
    if (!slotsRequest || '$ref' in slotsRequest) throw new Error('Missing slots request');
    expect((slotsRequest.content['application/json']?.schema as SchemaObject).properties).toHaveProperty('date');
    expect(schema('/admin/available-slots', 'post', '201').properties).toHaveProperty('slots');
  });

  it('shows auth scope, webhook secret, path and query parameters', () => {
    expect(operation('/health', 'get').security).toEqual([]);
    expect(operation('/telegram/webhook', 'post').security).toEqual([{ telegramWebhookSecret: [] }]);
    expect(operation('/admin/services', 'get').security).toEqual([{ firebaseBearer: [] }]);
    expect(operation('/admin/google-calendar', 'get').description).toContain('Owner access required');
    expect(operation('/admin/debug/logs', 'get').description).toContain('Designated debug owner');
    expect(operation('/admin/debug/access', 'get').description).not.toContain('Designated debug owner');
    const params = operation('/admin/schedule/source-topics', 'get').parameters as ParameterObject[];
    expect(params).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'chatId', in: 'query', required: true }), expect.objectContaining({ name: 'q', in: 'query', required: false })]));
    expect(params.filter(({ in: location }) => location === 'query').map(({ name }) => name)).toEqual(['chatId', 'q']);
    expect(operation('/admin/ai-chat/threads/{id}', 'get').parameters).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'id', in: 'path', required: true })]));
  });
});
