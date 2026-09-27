/** Shared provider transport; callers supply their own isolated prompts and tools. */
export async function createOpenAiConversation(signal: AbortSignal): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OpenAI is not configured');
  const response = await fetch('https://api.openai.com/v1/conversations', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal, body: '{}',
  });
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string' || !data.id) throw new Error('Invalid OpenAI conversation');
  return data.id;
}
export async function requestOpenAiResponse(body: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OpenAI is not configured');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini', ...(!body.conversation ? { store: false } : {}), ...body }),
  });
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
  return response.json();
}
