import { knowledgeBaseResponseSchema } from '@booking/contracts';
import { mediaSchema, mediaDeleteResponseSchema, createMediaSchema, updateMediaSchema, type MediaDto } from '@booking/contracts';
import { telegramAccountStatusSchema } from '@booking/contracts';
import { humanAssistanceSettingsResponseSchema, humanReleaseResponseSchema, humanRequestSchema, updateHumanAssistanceSettingsSchema, type HumanAssistanceSettings } from '@booking/contracts';
import { adminAccessResponseSchema, assistantPromptResponseSchema, availableSlotsResponseSchema, bookingSchema, botSettingsResponseSchema, conversationSchema, servicePhotoUploadResponseSchema, servicePhotoUploadSchema, serviceSchema, specResponseSchema, updateAdminAccessSchema, type BotSettings, type ServiceDto } from '@booking/contracts';
import { getAuth } from 'firebase/auth';
const request = async <T>(path: string, schema: { parse(value: unknown): T }, init?: RequestInit): Promise<T> => { const user = getAuth().currentUser; const token = user ? await user.getIdToken() : undefined; const response = await fetch(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init?.headers } }); if (!response.ok) { const body = (path.startsWith('/admin/telegram-account') || path.startsWith('/admin/media')) ? await response.json().catch(() => ({})) as { message?: unknown } : {}; throw new Error(typeof body.message === 'string' ? body.message : `API request failed (${response.status})`); } return schema.parse(await response.json()); };
const readMediaFile = async (file: File) => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
  return { filename: file.name, contentType: file.type, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
};
export const adminApi = {
  media: () => request('/admin/media', mediaSchema.array()),
  saveMedia: async (id: string | undefined, metadata: Pick<MediaDto, 'description' | 'debounceSeconds' | 'enabled'>, file?: File) => {
    const value = { ...metadata, ...(file ? { file: await readMediaFile(file) } : {}) };
    const input = id ? updateMediaSchema.parse(value) : createMediaSchema.parse(value);
    return request(id ? `/admin/media/${encodeURIComponent(id)}` : '/admin/media', mediaSchema, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(input) });
  },
  deleteMedia: (id: string) => request(`/admin/media/${encodeURIComponent(id)}`, mediaDeleteResponseSchema, { method: 'DELETE' }),
  telegramAccount: () => request('/admin/telegram-account', telegramAccountStatusSchema, { cache: 'no-store' }),
  telegramAccountAction: (action: 'start' | 'code' | 'password' | 'check' | 'disconnect', data?: { phone?: string; code?: string; password?: string }) => request(action === 'disconnect' ? '/admin/telegram-account' : `/admin/telegram-account/${action}`, telegramAccountStatusSchema, { method: action === 'disconnect' ? 'DELETE' : 'POST', ...(data ? { body: JSON.stringify(data) } : {}) }),
  bookings: () => request('/admin/bookings', bookingSchema.array()),
  services: () => request('/admin/services', serviceSchema.array()),
  saveService: (service: ServiceDto, isNew: boolean) => request(isNew ? '/admin/services' : `/admin/services/${encodeURIComponent(service.id)}`, serviceSchema, { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(service) }),
  uploadServicePhoto: async (serviceId: string, file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the selected image.'));
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the selected image.'));
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const input = servicePhotoUploadSchema.parse({ contentType: file.type, base64 });
    return request(`/admin/services/${encodeURIComponent(serviceId)}/photo`, servicePhotoUploadResponseSchema, { method: 'POST', body: JSON.stringify(input) });
  },
  conversations: () => request('/admin/conversations', conversationSchema.array()),
  updateConversation: (id: string, data: { assistantEnabled?: boolean }) => request(`/admin/conversations/${id}`, conversationSchema, { method: 'PATCH', body: JSON.stringify(data) }),
  slots: (data: { serviceId: string; date: string; durationMinutes?: number }) => request('/admin/available-slots', availableSlotsResponseSchema, { method: 'POST', body: JSON.stringify(data) }),
  spec: () => request('/admin/spec', specResponseSchema),
  knowledgeBase: () => request('/admin/knowledge-base', knowledgeBaseResponseSchema),
  saveKnowledgeBase: (content: string) => request('/admin/knowledge-base', knowledgeBaseResponseSchema, { method: 'PUT', body: JSON.stringify({ content }) }),
  resetKnowledgeBase: () => request('/admin/knowledge-base', knowledgeBaseResponseSchema, { method: 'DELETE' }),
  assistantPrompt: () => request('/admin/assistant-prompt', assistantPromptResponseSchema),
  saveAssistantPrompt: (prompt: string) => request('/admin/assistant-prompt', assistantPromptResponseSchema, { method: 'PUT', body: JSON.stringify({ prompt }) }),
  resetAssistantPrompt: () => request('/admin/assistant-prompt', assistantPromptResponseSchema, { method: 'DELETE' }),
  botSettings: () => request('/admin/bot-settings', botSettingsResponseSchema),
  saveBotSettings: (settings: BotSettings) => request('/admin/bot-settings', botSettingsResponseSchema, { method: 'PUT', body: JSON.stringify(settings) }),
  humanAssistanceSettings: () => request('/admin/human-assistance-settings', humanAssistanceSettingsResponseSchema),
  saveHumanAssistanceSettings: (settings: HumanAssistanceSettings) => request('/admin/human-assistance-settings', humanAssistanceSettingsResponseSchema, { method: 'PUT', body: JSON.stringify(updateHumanAssistanceSettingsSchema.parse(settings)) }),
  humanRequests: () => request('/admin/human-requests', humanRequestSchema.array()),
  replyHumanRequest: (id: string, text: string) => request(`/admin/human-requests/${encodeURIComponent(id)}/reply`, humanRequestSchema, { method: 'POST', body: JSON.stringify({ text }) }),
  releaseHumanRequest: (id: string) => request(`/admin/human-requests/${encodeURIComponent(id)}/release`, humanReleaseResponseSchema, { method: 'POST' }),
  adminAccess: () => request('/admin/admin-access', adminAccessResponseSchema),
  saveAdminAccess: (emails: string[]) => request('/admin/admin-access', adminAccessResponseSchema, { method: 'PUT', body: JSON.stringify(updateAdminAccessSchema.parse({ emails })) }),
};
