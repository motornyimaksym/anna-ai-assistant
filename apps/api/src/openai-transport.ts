/** Shared provider transport; callers supply their own isolated prompts and tools. */
export async function requestOpenAiResponse(body: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OpenAI is not configured');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini', store: false, ...body }),
  });
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
  return response.json();
}
