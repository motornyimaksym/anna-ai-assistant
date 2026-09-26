import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { AiChatController } from '../src/ai-chat.controller.js';
import { AdminGuard } from '../src/auth.js';
const id = 'de51f614-fffc-4a23-824f-788758a041fb';
describe('private AI API boundary', () => {
  it('uses current owner/stakeholder guard and never accepts an owner from the caller', () => {
    expect(Reflect.getMetadata('__guards__', AiChatController)).toEqual([AdminGuard]);
    const store = { list: vi.fn() }; const service = { message: vi.fn(), action: vi.fn() };
    const controller = new AiChatController(store as never, service as never);
    const req = { headers: {}, admin: { uid: 'stakeholder', isOwner: false } };
    controller.list(req); expect(store.list).toHaveBeenCalledWith('stakeholder');
    controller.message(req, id, { text: 'Hello' }); expect(service.message).toHaveBeenCalledWith('stakeholder', id, 'Hello');
    expect(() => controller.message(req, id, { text: 'Hello', uid: 'owner' })).toThrow();
    expect(() => controller.confirm(req, id, id, { text: 'Changed after approval' })).toThrow();
    expect(() => controller.read(req, '../owner')).toThrow();
    controller.confirm(req, id, id, {}); expect(service.action).toHaveBeenCalledWith('stakeholder', id, id, true);
  });
});
