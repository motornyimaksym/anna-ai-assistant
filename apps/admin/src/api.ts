import { googleCalendarStatusSchema, googleCalendarStartSchema, googleCalendarListSchema } from '@booking/contracts';
import { aiChatThreadSchema, aiChatSummarySchema } from '@booking/contracts';
import { knowledgeBaseResponseSchema } from '@booking/contracts';
import { mediaSchema, mediaDeleteResponseSchema, createMediaSchema, updateMediaSchema, type MediaDto } from '@booking/contracts';
import { telegramAccountStatusSchema } from '@booking/contracts';
import { telegramScheduleSlotsResponseSchema, telegramScheduleChatsSchema, telegramScheduleTopicsSchema } from '@booking/contracts';
import { humanAssistanceSettingsResponseSchema, humanReleaseResponseSchema, humanRequestSchema, updateHumanAssistanceSettingsSchema, type HumanAssistanceSettings } from '@booking/contracts';
import { adminAccessResponseSchema, assistantPromptResponseSchema, availableSlotsResponseSchema, bookingSchema, botSettingsResponseSchema, conversationSchema, servicePhotoUploadResponseSchema, servicePhotoUploadSchema, serviceSchema, specResponseSchema, updateAdminAccessSchema, type BotSettings, type ServiceDto } from '@booking/contracts';
import { getAuth } from 'firebase/auth';
const request = async <T>(path: string, schema: { parse(value: unknown): T }, init?: RequestInit): Promise<T> => { const user = getAuth().currentUser; const token = user ? await user.getIdToken() : undefined; const response = await fetch(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init?.headers } }); if (!response.ok) { const body = (path.startsWith('/admin/telegram-account') || path.startsWith('/admin/media') || path.startsWith('/admin/ai-chat') || path.startsWith('/admin/schedule') || path.startsWith('/admin/google-calendar')) ? await response.json().catch(() => ({})) as { message?: unknown } : {}; throw new Error(typeof body.message === 'string' ? body.message : `API request failed (${response.status})`); } return schema.parse(await response.json()); };
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
  googleCalendar: () => request('/admin/google-calendar', googleCalendarStatusSchema, { cache: 'no-store' }),
  startGoogleCalendar: () => request('/admin/google-calendar/start', googleCalendarStartSchema, { method: 'POST', body: '{}' }),
  completeGoogleCalendar: (input: { state: string; code?: string; denied?: boolean }) => request('/admin/google-calendar/complete', googleCalendarStatusSchema, { method: 'POST', body: JSON.stringify(input) }),
  googleCalendars: () => request('/admin/google-calendar/calendars', googleCalendarListSchema, { cache: 'no-store' }),
  selectGoogleCalendar: (calendarId: string) => request('/admin/google-calendar/selection', googleCalendarStatusSchema, { method: 'PUT', body: JSON.stringify({ calendarId }) }),
  checkGoogleCalendar: () => request('/admin/google-calendar/check', googleCalendarStatusSchema, { method: 'POST', body: '{}' }),
  disconnectGoogleCalendar: () => request('/admin/google-calendar', googleCalendarStatusSchema, { method: 'DELETE' }),

  media: () => request('/admin/media', mediaSchema.array()),
  saveMedia: async (id: string | undefined, metadata: Pick<MediaDto, 'description' | 'debounceSeconds' | 'enabled'>, file?: File) => {
    const value = { ...metadata, ...(file ? { file: await readMediaFile(file) } : {}) };
    const input = id ? updateMediaSchema.parse(value) : createMediaSchema.parse(value);
    return request(id ? `/admin/media/${encodeURIComponent(id)}` : '/admin/media', mediaSchema, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(input) });
  },
  deleteMedia: (id: string) => request(`/admin/media/${encodeURIComponent(id)}`, mediaDeleteResponseSchema, { method: 'DELETE' }),
  telegramAccount: () => request('/admin/telegram-account', telegramAccountStatusSchema, { cache: 'no-store' }),
  telegramAccountAction: (action: 'start' | 'code' | 'password' | 'check' | 'disconnect', data?: { phone?: string; code?: string; password?: string }) => request(action === 'disconnect' ? '/admin/telegram-account' : `/admin/telegram-account/${action}`, telegramAccountStatusSchema, { method: action === 'disconnect' ? 'DELETE' : 'POST', ...(data ? { body: JSON.stringify(data) } : {}) }),
  telegramScheduleChats: () => request('/admin/schedule/source-chats', telegramScheduleChatsSchema, { cache: 'no-store' }),
  telegramScheduleTopics: (chatId: string, q = '') => request(`/admin/schedule/source-topics?${new URLSearchParams({ chatId, q })}`, telegramScheduleTopicsSchema, { cache: 'no-store' }),
  selectScheduleSource: (chatId: string, topicId?: number) => request('/admin/schedule/source', telegramScheduleSlotsResponseSchema, { method: 'PUT', body: JSON.stringify({ chatId, topicId }) }),
  refreshSchedule: (retryTransient = false) => request('/admin/schedule/refresh', telegramScheduleSlotsResponseSchema, { method: 'POST', body: JSON.stringify(retryTransient ? { retryTransient: true } : {}) }),
  telegramScheduleSlots: () => request('/admin/schedule/imported-slots', telegramScheduleSlotsResponseSchema, { cache: 'no-store' }),
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

export const aiChatApi = {
  threads: () => request('/admin/ai-chat/threads', aiChatSummarySchema.array(), { cache: 'no-store' }),
  create: () => request('/admin/ai-chat/threads', aiChatThreadSchema, { method: 'POST', body: '{}' }),
  thread: (id: string) => request(`/admin/ai-chat/threads/${encodeURIComponent(id)}`, aiChatThreadSchema, { cache: 'no-store' }),
  message: (id: string, text: string) => request(`/admin/ai-chat/threads/${encodeURIComponent(id)}/messages`, aiChatThreadSchema, { method: 'POST', body: JSON.stringify({ text }) }),
  action: (id: string, actionId: string, confirm: boolean) => request(`/admin/ai-chat/threads/${encodeURIComponent(id)}/actions/${encodeURIComponent(actionId)}/${confirm ? 'confirm' : 'cancel'}`, aiChatThreadSchema, { method: 'POST', body: '{}' }),
};
