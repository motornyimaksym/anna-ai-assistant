export type LinearBackoffOptions = {
  /** OpenAI structured rate-limit reset durations on HTTP 429. */
  rateLimitResetHeaders?: boolean;
  /** Best-effort diagnostics callback, one-based attempt number. */
  onAttempt?: (attempt: number) => void;
  /** Set only when repeating the request cannot repeat its side effect. */
  replaySafe?: boolean;
  /** Retry count after the initial request. Capped at three. */
  retries?: number;
  /** First wait in milliseconds; later waits scale linearly. */
  baseDelayMs?: number;
  /** Optional exact waits for each retry, indexed from the first retry. */
  retryDelaysMs?: readonly number[];
  /** Per-attempt timeout. Caller signal remains the overall deadline. */
  timeoutMs?: number;
};

const defaultRetries = 3;
const defaultBaseDelayMs = 250;
const retryableStatuses = new Set([408, 425, 429]);
const preSendNetworkCodes = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT']);

const requestMethod = (input: RequestInfo | URL, init: RequestInit) =>
  (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

const requestSignal = (input: RequestInfo | URL, init: RequestInit) =>
  init.signal === undefined && input instanceof Request ? input.signal : init.signal ?? undefined;

const isRetryableStatus = (status: number) => retryableStatuses.has(status) || (status >= 500 && status <= 599);

const maxRetryWaitMs = 60_000;
const finiteDelay = (value: number): number | undefined => Number.isFinite(value) && value >= 0 ? value : undefined;
function durationMs(value: string | null): number | undefined {
  if (!value || !/^(?:\d+(?:\.\d+)?(?:ms|s|m|h))+$/.test(value)) return undefined;
  const units: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3600_000 };
  return finiteDelay([...value.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)].reduce((sum, match) => sum + Number(match[1]) * units[match[2]!]!, 0));
}
function serverRetryDelay(response: Response, resetHeaders: boolean): number {
  const get = (name: string) => response.headers?.get(name)?.trim() ?? null;
  const hints: number[] = [];
  const after = get('retry-after');
  if (after) {
    const parsed = /^\d+(?:\.\d+)?$/.test(after) ? Number(after) * 1000
      : /^[A-Za-z]{3},/.test(after) ? Math.max(0, Date.parse(after) - Date.now()) : NaN;
    const delay = finiteDelay(parsed);
    if (delay !== undefined) hints.push(delay);
  }
  const milliseconds = get('retry-after-ms');
  if (milliseconds && /^\d+(?:\.\d+)?$/.test(milliseconds)) {
    const delay = finiteDelay(Number(milliseconds));
    if (delay !== undefined) hints.push(delay);
  }
  if (resetHeaders && response.status === 429) {
    const tokens = durationMs(get('x-ratelimit-reset-tokens'));
    if (tokens !== undefined) hints.push(tokens);
    if (get('x-ratelimit-remaining-requests') === '0') {
      const requests = durationMs(get('x-ratelimit-reset-requests'));
      if (requests !== undefined) hints.push(requests);
    }
  }
  return Math.max(0, ...hints);
}

function hasPreSendFailure(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    if ('code' in current && typeof current.code === 'string' && preSendNetworkCodes.has(current.code)) return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Shared fetch retry policy. Unsafe writes only retry explicit rejection or proven pre-send connection failure. */
export async function fetchWithLinearBackoff(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: LinearBackoffOptions = {},
): Promise<Response> {
  const method = requestMethod(input, init);
  const replaySafe = options.replaySafe ?? ['GET', 'HEAD', 'OPTIONS'].includes(method);
  const retries = Math.max(0, Math.min(defaultRetries, Math.floor(options.retries ?? defaultRetries)));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? defaultBaseDelayMs);
  const retryDelayMs = (attempt: number) => {
    const configured = options.retryDelaysMs?.[attempt];
    return configured !== undefined && Number.isFinite(configured) && configured >= 0
      ? configured
      : baseDelayMs * (attempt + 1);
  };
  const overallSignal = requestSignal(input, init);
  const requestTemplate = input instanceof Request ? input.clone() : undefined;

  for (let attempt = 0; ; attempt++) {
    overallSignal?.throwIfAborted();
    const timeoutSignal = options.timeoutMs === undefined ? undefined : AbortSignal.timeout(options.timeoutMs);
    const signal = timeoutSignal
      ? overallSignal ? AbortSignal.any([overallSignal, timeoutSignal]) : timeoutSignal
      : overallSignal;
    const attemptInit = { ...init, ...(signal ? { signal } : {}) };

    try { options.onAttempt?.(attempt + 1); } catch { /* Observability must not affect delivery. */ }
    let response: Response;
    try {
      response = requestTemplate
        ? await fetch(requestTemplate.clone(), attemptInit)
        : await fetch(input, attemptInit);
    } catch (error) {
      const retry = replaySafe || hasPreSendFailure(error);
      if (attempt >= retries || !retry || overallSignal?.aborted) throw error;
      await wait(retryDelayMs(attempt), overallSignal);
      continue;
    }

    const mayRetryResponse = replaySafe || response.status === 425 || response.status === 429;
    if (attempt >= retries || !isRetryableStatus(response.status) || !mayRetryResponse) return response;
    const fallback = response.status === 429 ? Math.max(1000 * 2 ** attempt, retryDelayMs(attempt)) : retryDelayMs(attempt);
    const delay = Math.max(fallback, serverRetryDelay(response, options.rateLimitResetHeaders ?? false));
    if (delay > maxRetryWaitMs) return response;
    await response.body?.cancel().catch(() => undefined);
    await wait(delay, overallSignal);
  }
}
