/**
 * eToro Public API client.
 *
 * Follows the `building-etoro-api-client` skill and `etoro-api-conventions`
 * rule:
 *   - JSON in/out against `https://public-api.etoro.com/api/v1`.
 *   - Credentials modelled as a discriminated union so the "never send both
 *     auth families" rule is structurally enforced.
 *   - `x-request-id` (UUID v4) on every request.
 *   - Retry strategy differs by HTTP error class (401 / 413-414 / 429 / 5xx).
 *
 * The transport `fetch` is injectable so tests and the mock data source can
 * exercise the real header/retry/parse code path without hitting the network.
 */
import { randomUUID } from 'node:crypto';
import {
  EtoroApiError,
  EtoroPayloadTooLargeError,
  EtoroRateLimitError,
  SsoSessionExpiredError,
} from './errors.js';

const PUBLIC_API_BASE = 'https://public-api.etoro.com/api/v1';

/** The two — and only two — valid auth modes. Never both at once. */
export type EtoroRequestContext =
  | { mode: 'bearer'; accessToken: string }
  | { mode: 'apiKey'; userKey: string };

export type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export interface EtoroClientOptions {
  /** Injectable transport; defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
  /** Partner API key used with `x-user-key` in apiKey mode. */
  apiKey?: string;
  /** Max attempts for retryable classes (429 / 5xx). */
  maxRetries?: number;
  /** Base backoff in ms; overridable so tests don't sleep for real. */
  backoffBaseMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function buildEtoroHeaders(
  ctx: EtoroRequestContext,
  apiKey?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-request-id': randomUUID(),
  };
  if (ctx.mode === 'bearer') {
    headers['Authorization'] = `Bearer ${ctx.accessToken}`;
  } else {
    const key = apiKey ?? process.env.ETORO_API_KEY;
    if (!key) {
      throw new Error(
        'apiKey auth mode requires ETORO_API_KEY (x-api-key) to be set',
      );
    }
    headers['x-api-key'] = key;
    headers['x-user-key'] = ctx.userKey;
  }
  return headers;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class EtoroClient {
  private readonly fetchImpl: FetchLike;
  private readonly apiKey?: string;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: EtoroClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
    this.apiKey = opts.apiKey;
    this.maxRetries = opts.maxRetries ?? 3;
    this.backoffBaseMs = opts.backoffBaseMs ?? 300;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  /**
   * GET a Public API path and parse the JSON body into `T`.
   *
   * Retry policy (per skill Step 3):
   *   - 401       → surfaced as SsoSessionExpiredError (caller refreshes once).
   *   - 413 / 414 → surfaced as EtoroPayloadTooLargeError (caller shrinks batch).
   *   - 429       → back off, same payload, retry.
   *   - 5xx       → short exponential backoff, retry.
   *   - other 4xx → surfaced immediately.
   */
  async get<T>(path: string, ctx: EtoroRequestContext): Promise<T> {
    const url = `${PUBLIC_API_BASE}${path}`;
    let attempt = 0;

    for (;;) {
      const headers = buildEtoroHeaders(ctx, this.apiKey);
      let res: Response;
      try {
        res = await this.fetchImpl(url, { method: 'GET', headers });
      } catch (err) {
        // Network-level failure — treat like a transient 5xx.
        if (attempt < this.maxRetries) {
          await this.backoff(attempt++);
          continue;
        }
        throw new EtoroApiError(
          `Network error calling ${path}: ${(err as Error).message}`,
          0,
        );
      }

      if (res.ok) {
        return (await res.json()) as T;
      }

      const status = res.status;
      const bodyText = await res.text().catch(() => '');
      const message = extractErrorMessage(bodyText, status, path);

      if (status === 401) {
        throw new SsoSessionExpiredError(message);
      }
      if (status === 413 || status === 414) {
        throw new EtoroPayloadTooLargeError(message, status);
      }
      if (status === 429) {
        if (attempt < this.maxRetries) {
          await this.backoff(attempt++);
          continue;
        }
        throw new EtoroRateLimitError(message);
      }
      if (status >= 500) {
        if (attempt < this.maxRetries) {
          await this.backoff(attempt++);
          continue;
        }
        throw new EtoroApiError(message, status);
      }
      // Other 4xx — the request shape itself is wrong; don't retry.
      throw new EtoroApiError(message, status);
    }
  }

  private backoff(attempt: number): Promise<void> {
    // 300ms → 900ms → 2700ms … capped.
    const delay = Math.min(this.backoffBaseMs * 3 ** attempt, 30_000);
    return this.sleep(delay);
  }
}

function extractErrorMessage(
  body: string,
  status: number,
  path: string,
): string {
  if (body) {
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {
      // free-form / empty body — fall through
    }
  }
  return `eToro ${status} on ${path}`;
}
