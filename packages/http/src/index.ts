export type LinearBackoffOptions = {
  /** Set only when repeating the request cannot repeat its side effect. */
  replaySafe?: boolean;
  /** Retry count after the initial request. Capped at three. */
  retries?: number;
  /** First wait in milliseconds; later waits scale linearly. */
  baseDelayMs?: number;
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
  const overallSignal = requestSignal(input, init);
  const requestTemplate = input instanceof Request ? input.clone() : undefined;

  for (let attempt = 0; ; attempt++) {
    overallSignal?.throwIfAborted();
    const timeoutSignal = options.timeoutMs === undefined ? undefined : AbortSignal.timeout(options.timeoutMs);
    const signal = timeoutSignal
      ? overallSignal ? AbortSignal.any([overallSignal, timeoutSignal]) : timeoutSignal
      : overallSignal;
    const attemptInit = { ...init, ...(signal ? { signal } : {}) };

    let response: Response;
    try {
      response = requestTemplate
        ? await fetch(requestTemplate.clone(), attemptInit)
        : await fetch(input, attemptInit);
    } catch (error) {
      const retry = replaySafe || hasPreSendFailure(error);
      if (attempt >= retries || !retry || overallSignal?.aborted) throw error;
      await wait(baseDelayMs * (attempt + 1), overallSignal);
      continue;
    }

    const mayRetryResponse = replaySafe || response.status === 425 || response.status === 429;
    if (attempt >= retries || !isRetryableStatus(response.status) || !mayRetryResponse) return response;
    await response.body?.cancel().catch(() => undefined);
    await wait(baseDelayMs * (attempt + 1), overallSignal);
  }
}
