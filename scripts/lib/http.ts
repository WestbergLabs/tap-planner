// Shared HTTP helper for the BrewPack scanner and importer.
//
// Pinter's storefront is a third-party site we do not control, so every request
// carries a clear Tap Planner user agent, times out rather than hanging, and
// retries a small number of times on transient failures (network errors, HTTP
// 429, and 5xx). Permanent failures (404, malformed structure) are surfaced
// immediately so a scan fails loudly instead of silently corrupting data.

/** User agent identifying this community tool to Pinter's servers. */
export const USER_AGENT =
  "TapPlanner/1.0 BrewPack monitor (community planning tool)";

export type FetchOptions = {
  /** Per-attempt timeout in milliseconds. */
  timeoutMs?: number;
  /** Number of retries after the first attempt (so total attempts = retries+1). */
  retries?: number;
  /** Base backoff in milliseconds; grows linearly per attempt. */
  backoffMs?: number;
};

const DEFAULTS: Required<FetchOptions> = {
  timeoutMs: 15_000,
  retries: 3,
  backoffMs: 1_000,
};

/** Whether an HTTP status is worth retrying (429 rate limit, or any 5xx). */
function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch a URL as text with a timeout and limited retries. Retries transient
 * failures (network error, 429, 5xx) with linear backoff, honoring a
 * `Retry-After` header when present on a 429. Throws a descriptive error once
 * retries are exhausted or on a non-retryable status (e.g. 404).
 */
export async function fetchTextWithRetry(
  url: string,
  options: FetchOptions = {},
): Promise<string> {
  const { timeoutMs, retries, backoffMs } = { ...DEFAULTS, ...options };

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
      });

      if (response.ok) {
        return await response.text();
      }

      if (!isRetryableStatus(response.status) || attempt === retries) {
        throw new Error(
          `${url} returned ${response.status} ${response.statusText}`,
        );
      }

      // Retryable status: prefer the server's Retry-After hint for 429.
      const retryAfter = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1_000
        : backoffMs * (attempt + 1);

      lastError = new Error(
        `${url} returned ${response.status} ${response.statusText}`,
      );
      await sleep(wait);
      continue;
    } catch (error) {
      lastError = error;

      // A thrown non-retryable HTTP error (from the block above) should not be
      // retried again; re-throw on the final attempt regardless.
      if (attempt === retries) {
        break;
      }

      await sleep(backoffMs * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts: ${detail}`);
}

/** Fetch and parse JSON with the same retry semantics as `fetchTextWithRetry`. */
export async function fetchJsonWithRetry<T>(
  url: string,
  options: FetchOptions = {},
): Promise<T> {
  const text = await fetchTextWithRetry(url, options);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${url} did not return valid JSON.`);
  }
}
