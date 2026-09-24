import { assistantPromptResponseSchema, availableSlotsResponseSchema, bookingSchema, conversationSchema, serviceSchema, specResponseSchema } from '@booking/contracts';
import { getAuth } from 'firebase/auth';
const request = async <T>(path: string, schema: { parse(value: unknown): T }, init?: RequestInit): Promise<T> => { const user = getAuth().currentUser; const token = user ? await user.getIdToken() : undefined; const response = await fetch(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init?.headers } }); if (!response.ok) throw new Error(`API request failed (${response.status})`); return schema.parse(await response.json()); };
export const adminApi = {
  bookings: () => request('/admin/bookings', bookingSchema.array()),
  services: () => request('/admin/services', serviceSchema.array()),
  conversations: () => request('/admin/conversations', conversationSchema.array()),
  updateConversation: (id: string, data: { assistantEnabled?: boolean }) => request(`/admin/conversations/${id}`, conversationSchema, { method: 'PATCH', body: JSON.stringify(data) }),
  slots: (data: { serviceId: string; date: string }) => request('/admin/available-slots', availableSlotsResponseSchema, { method: 'POST', body: JSON.stringify(data) }),
  spec: () => request('/admin/spec', specResponseSchema),
  assistantPrompt: () => request('/admin/assistant-prompt', assistantPromptResponseSchema),
  saveAssistantPrompt: (prompt: string) => request('/admin/assistant-prompt', assistantPromptResponseSchema, { method: 'PUT', body: JSON.stringify({ prompt }) }),
  resetAssistantPrompt: () => request('/admin/assistant-prompt', assistantPromptResponseSchema, { method: 'DELETE' }),
};
