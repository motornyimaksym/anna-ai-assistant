import { assistantPromptResponseSchema, availableSlotsResponseSchema, bookingSchema, botSettingsResponseSchema, conversationSchema, servicePhotoUploadResponseSchema, servicePhotoUploadSchema, serviceSchema, specResponseSchema, type BotSettings, type ServiceDto } from '@booking/contracts';
import { getAuth } from 'firebase/auth';
const request = async <T>(path: string, schema: { parse(value: unknown): T }, init?: RequestInit): Promise<T> => { const user = getAuth().currentUser; const token = user ? await user.getIdToken() : undefined; const response = await fetch(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init?.headers } }); if (!response.ok) throw new Error(`API request failed (${response.status})`); return schema.parse(await response.json()); };
export const adminApi = {
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
  slots: (data: { serviceId: string; date: string }) => request('/admin/available-slots', availableSlotsResponseSchema, { method: 'POST', body: JSON.stringify(data) }),
  spec: () => request('/admin/spec', specResponseSchema),
  assistantPrompt: () => request('/admin/assistant-prompt', assistantPromptResponseSchema),
  saveAssistantPrompt: (prompt: string) => request('/admin/assistant-prompt', assistantPromptResponseSchema, { method: 'PUT', body: JSON.stringify({ prompt }) }),
  resetAssistantPrompt: () => request('/admin/assistant-prompt', assistantPromptResponseSchema, { method: 'DELETE' }),
  botSettings: () => request('/admin/bot-settings', botSettingsResponseSchema),
  saveBotSettings: (settings: BotSettings) => request('/admin/bot-settings', botSettingsResponseSchema, { method: 'PUT', body: JSON.stringify(settings) }),
};
