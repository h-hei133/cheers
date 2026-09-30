/**
 * Retrying a model call that failed for a reason that may not repeat.
 *
 * A rate limit, a gateway restart and a dropped socket are all answers the same
 * request can get a different result from a moment later. Without a retry they
 * end the turn, and the user sees a failure where waiting would have worked —
 * with no way to ask for the wait, because a failed step has no argument.
 *
 * Two layers retry, and they are separate because they see different facts:
 *
 *   - The provider layer sees the HTTP status and the response headers, so it is
 *     the only one that can honour a server's own `Retry-After`. It retries one
 *     request and knows nothing about the conversation.
 *   - The turn layer sees the finished step's failure text, and runs between
 *     steps, so it can retry after the context has been reshaped — compaction
 *     being the case that matters.
 *
 * Their defaults differ on purpose. The provider layer starts at zero retries so
 * that a transient failure costs one retry rather than one per layer; the turn
 * layer starts at three, because it is the one that can reconsider the request.
 */

/** How many times, how long, and whether to try at all. */
export interface RetryPolicy {
  readonly enabled: boolean;
  /** Retries after the first attempt, which never counts as one. */
  readonly maxRetries: number;
  /** First backoff, doubled per retry. */
  readonly baseDelayMs: number;
  /** Ceiling for a locally computed backoff. */
  readonly maxDelayMs: number;
}

/** Backoff when nothing about the failure suggests a better number. */
export const DEFAULT_RETRY_BASE_DELAY_MS = 2_000;
/** Ceiling on a locally computed backoff, so a long run stays interruptible. */
export const DEFAULT_RETRY_MAX_DELAY_MS = 60_000;
/** Retries the turn layer performs when the user has not said otherwise. */
export const DEFAULT_TURN_RETRIES = 3;
/** Retries the provider layer performs. Zero, so one failure is one retry. */
export const DEFAULT_PROVIDER_RETRIES = 0;
/**
 * How much of a locally computed backoff may be shaved off to spread retries.
 *
 * Downward only, so a computed delay is never extended past what the caller
 * asked to tolerate. A quarter is enough to separate clients that failed
 * together without collapsing a backoff toward zero.
 */
const JITTER_FRACTION = 0.25;

/**
 * Failures worth trying again, matched against the provider's own wording.
 *
 * Patterns rather than a status enum because the text is what survives: by the
 * time a failure reaches the turn layer the status code is gone, and providers
 * disagree about which code means "busy" anyway.
 */
const RETRYABLE_FAILURE =
  /overloaded|currently experiencing high demand|rate.?limit|too many requests|\b(?:408|409|429|500|502|503|504|520|524)\b|service.?unavailable|server.?error|internal.?error|provider.?returned.?error|network.?error|connection.?(?:error|refused|lost)|other side closed|fetch failed|getaddrinfo|ENOTFOUND|EAI_AGAIN|upstream.?connect|reset before headers|socket hang up|socket connection was closed|timed? out|timeout|terminated|websocket.?(?:closed|error)|ended without|stream ended before|http2 request did not get a response|retry delay|retry your request|try your request again|ResourceExhausted/i;

/**
 * Failures that will not improve by asking again.
 *
 * An account out of budget stays out of budget, and a retry spends quota to
 * learn the same thing. These are checked first: a message can carry both a
 * limit and a status code, and the limit is the truer answer.
 *
 * A refusal belongs here for the same reason. A safety block or a content
 * filter answers the same request the same way every time, so retrying one
 * spends quota to be refused again — and presents the refusal as a transient
 * outage the user should wait out.
 */
const UNRECOVERABLE_FAILURE =
  /GoUsageLimitError|FreeUsageLimitError|Monthly usage limit reached|available balance|insufficient_quota|out of budget|quota exceeded|billing/i;

/**
 * A refusal, as distinct from a failure.
 *
 * Checked alongside the unrecoverable set, but kept as its own pattern because
 * the reason differs: a limit will still hold tomorrow, while a refusal holds
 * for this request no matter when it is asked. Both mean the same thing for the
 * retry decision — asking again cannot help — but conflating them would report
 * a safety block as an exhausted account.
 */
export const REFUSAL =
  /\brefusal\b|guardrail_intervened|content.?filter|\bsafety\b|recitation|prohibited.?content|blocked.?content|refused the prompt/i;

/**
 * Whether a finished step failed for a reason another attempt could survive.
 *
 * `stopReason` is taken as a string rather than the narrower union so callers
 * that only have a message-shaped record can use this without casting.
 */
export function isRetryableFailure(stopReason: string, errorMessage: string | undefined): boolean {
  if (stopReason === "aborted") return false;
  if (stopReason !== "error") return false;
  const message = errorMessage ?? "";
  if (UNRECOVERABLE_FAILURE.test(message)) return false;
  if (REFUSAL.test(message)) return false;
  return RETRYABLE_FAILURE.test(message);
}

/**
 * Whether a request that came back with this status is worth sending again.
 *
 * No status at all means the request never arrived — a transport failure, which
 * is exactly the kind that a second attempt fixes.
 */
export function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true;
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

/**
 * The wait a server asked for, in milliseconds.
 *
 * Both spellings are accepted because providers use both: the numeric
 * milliseconds one, and the seconds-or-date one. Nothing is returned when the
 * header is absent or unreadable, so the caller falls back to its own backoff
 * rather than treating a malformed header as a zero wait.
 */
export function serverRequestedDelayMs(
  retryAfterMs: string | null,
  retryAfter: string | null,
  now: number = Date.now(),
): number | undefined {
  const millis = readNonNegativeNumber(retryAfterMs);
  if (millis !== undefined) return millis;

  const seconds = readNonNegativeNumber(retryAfter);
  if (seconds !== undefined) return seconds * 1000;

  if (retryAfter === null || retryAfter.trim() === "") return undefined;
  const asDate = Date.parse(retryAfter);
  if (Number.isNaN(asDate)) return undefined;
  return Math.max(0, asDate - now);
}

/**
 * The delay before a retry, preferring what the server asked for.
 *
 * The server's number wins because it is knowledge rather than a guess: a
 * rate-limited host that says "wait a minute" is describing its own refill, and
 * retrying after two seconds spends a request to be refused again. It is also
 * used verbatim, because it is an instruction — spreading it out would be
 * ignoring what the host asked for.
 *
 * A locally computed backoff is spread instead. Doubling alone makes every
 * client that failed at the same moment retry at the same moment, which is the
 * load the backoff exists to avoid: a shared outage turns into a synchronised
 * one. The spread is downward only, so the delay never exceeds what was
 * computed and the cap stays a real ceiling.
 */
export function retryDelayMs(
  policy: RetryPolicy,
  attempt: number,
  requestedMs: number | undefined,
): number {
  if (requestedMs !== undefined) return Math.min(requestedMs, policy.maxDelayMs);
  const doubled = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const finite = Number.isSafeInteger(doubled) ? doubled : Number.MAX_SAFE_INTEGER;
  // Up to a quarter off, which is enough to separate clients that started
  // together without turning a short backoff into no backoff at all.
  const spread = finite * (1 - Math.random() * JITTER_FRACTION);
  return Math.min(Math.round(spread), policy.maxDelayMs);
}

/**
 * Whether a server's requested wait is longer than this run is willing to wait.
 *
 * A server that names a delay beyond the ceiling is saying the endpoint is not
 * worth asking again yet, and the number it gives is the useful part of the
 * answer. Waiting the ceiling and asking anyway spends a request to be told the
 * same thing, and reports nothing about why.
 */
export function exceedsRetryCeiling(policy: RetryPolicy, requestedMs: number | undefined): boolean {
  return requestedMs !== undefined && policy.maxDelayMs > 0 && requestedMs > policy.maxDelayMs;
}

/**
 * Wait out a backoff, or give up as soon as the run is cancelled.
 *
 * Resolves `false` when the wait was cut short, so the caller returns instead of
 * retrying a request nobody is waiting for any more.
 */
export function waitBeforeRetry(delayMs: number, signal: AbortSignal | undefined): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  if (delayMs <= 0) return Promise.resolve(true);
  // Built by hand rather than with `Promise.withResolvers`, which needs Node 22.
  // The declared floor is 20.3 for `AbortSignal.any`, and a helper that only exists
  // on a newer runtime than the package claims turns the first retry into a
  // `TypeError` on every machine inside the declared range. This went unnoticed
  // until CI was checked: it runs Node 20, and every local run was Node 24.
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((settle) => {
    resolve = settle;
  });
  const timer = setTimeout(() => {
    signal?.removeEventListener("abort", onAbort);
    resolve(true);
  }, delayMs);
  // Not `once` alone: the listener has to come off when the timer wins too, or
  // every retry leaves one behind for the life of the process.
  const onAbort = (): void => {
    clearTimeout(timer);
    resolve(false);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  return promise;
}

/**
 * Resolve a policy from settings, keeping the two layers' defaults apart.
 *
 * `enabled: false` is read as "no retries anywhere" rather than as a third
 * state: a user who turns retrying off means the whole mechanism, and having to
 * also zero two counts would make the one switch they wanted into three.
 */
export function resolveRetryPolicy(
  layer: "provider" | "turn",
  settings: {
    readonly enabled?: boolean;
    readonly maxRetries?: number;
    readonly baseDelayMs?: number;
    readonly maxDelayMs?: number;
  },
): RetryPolicy {
  const enabled = settings.enabled ?? true;
  const fallback = layer === "provider" ? DEFAULT_PROVIDER_RETRIES : DEFAULT_TURN_RETRIES;
  return {
    enabled,
    maxRetries: enabled ? Math.max(0, settings.maxRetries ?? fallback) : 0,
    baseDelayMs: Math.max(0, settings.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS),
    maxDelayMs: Math.max(0, settings.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS),
  };
}

/** A non-negative number from a header value, or nothing when it is not one. */
function readNonNegativeNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}
