/**
 * What one model was used for, within a session.
 *
 * Usage is bucketed by model because a session can switch models partway through
 * and the rates differ. A single flat record meant the newest model's rate was
 * applied to every token the session had ever spent, so `/cost` reported an
 * amount nobody would be billed: the counts were measured correctly and then
 * attributed to the wrong model.
 */
import type { RequestContext } from '../../context/request/model.js';

export interface ModelUsageBucket {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** How many requests this model answered. */
  turnsCount: number;
}

export interface PromptMeasurementIdentity {
  readonly provider: string;
  readonly model: string;
  readonly endpoint?: string;
  /** Serialized tool schema and assembled system text, hashed. */
  readonly schemaDigest?: string;
  readonly systemDigest?: string;
}

export interface SessionUsageTelemetry {
  /** Last accepted foreground request in this runtime, never persisted as cumulative usage. */
  requestContext?: RequestContext;
  /**
   * Usage per model, keyed by `<provider>/<model>`.
   *
   * The only place token counts live. A session-level total would be a second
   * copy that could disagree with the buckets it was derived from, and the whole
   * point of the buckets is that one number cannot describe two models.
   *
   * The provider is part of the key because rates are published per provider: a
   * model id that two providers both serve can cost different amounts, so keying
   * by model alone repriced every earlier bucket the moment the user switched,
   * which is the same defect the buckets were introduced to remove, one axis over.
   *
   * Built with a null prototype. A plain object inherits from `Object.prototype`,
   * so a model named `__proto__` or `constructor` — both reachable, since the id
   * is unvalidated input from `/model` and from a provider's model list — resolved
   * to an inherited value and was written into it, corrupting the prototype for
   * the whole process and reporting `NaN` tokens for that model.
   */
  byModel: Record<string, ModelUsageBucket>;
  /**
   * The last few requests, newest last, for reading what happened turn to turn.
   *
   * The buckets above answer "what has this session spent". They cannot answer
   * "was the cache used well", because that is a question about one request
   * relative to the one before it — how much of this prompt should have been a
   * cache read, given what the previous request had already sent. That comparison
   * needs both requests, and summing loses exactly the ordering it depends on.
   *
   * Bounded rather than complete. It is a running view for a report read during
   * the session, not a ledger: a session left open for a day does not need every
   * request it ever made kept in memory to answer a question about the recent
   * past, and the oldest entries are the least relevant to it.
   */
  recentRequests: UsageHistoryEntry[];
  /**
   * Prompt tokens of the most recent request. This, not the cumulative total, is
   * the session's live context footprint: every request resends the whole
   * conversation, so the sum across turns counts the same context many times over.
   * Undefined means no current provider measurement; a reported zero stays zero.
   */
  lastPromptTokens: number | undefined;
  /**
   * How many messages that request carried.
   *
   * The measured count only covers what was sent. Anything the conversation
   * gained afterwards is not in the provider's number, so the two have to be
   * added together before either can answer whether the next request fits.
   */
  lastPromptMessageCount: number;
  /** What the measurement describes; a different model or schema makes it stale. */
  lastPromptIdentity?: PromptMeasurementIdentity;
  turnsCount: number;
  toolCallsCount: number;
  /**
   * The bucket key of the last recorded request.
   *
   * Not for display: it exists so a report that arrives without a model name is
   * attributed to the one that last answered rather than to a separate `default`
   * bucket that would split a single model's tokens in two. It was previously
   * documented as "for display" while nothing displayed it, and every reader that
   * once used it had been migrated to the bucket keys.
   */
  lastBucketKey: string;
  lastUpdated: number;
}

/**
 * One request, as the cache comparison needs to see it.
 *
 * `promptTokens` is the whole prompt the provider was sent — input plus both
 * cache figures — because that is what the next request's cache reads are
 * measured against. `cacheRead`/`cacheWrite` stay separate so a request that
 * reported no cache activity at all can be told from one that reported zero.
 */
export interface UsageHistoryEntry {
  /** The prompt the provider was sent, in total. */
  promptTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  /** `<provider>/<model>`, for spotting a switch that re-bills the prompt. */
  readonly bucketKey: string;
  readonly timestamp: number;
  /**
   * Whether any request up to here reported cache activity.
   *
   * Sticky across the history, and not per-entry. A provider that never reports
   * caching and a provider that reports a total miss look identical on one
   * request; what separates them is whether caching was ever seen. Without this
   * the first request on a cache-capable provider reads as a miss on every turn.
   */
  readonly reportedCache: boolean;
  /**
   * Whether this entry marks a rebuilt context rather than a request.
   *
   * A compaction or a branch move replaces the conversation, so the prompt that
   * follows shares nothing with the one before. Comparing them would count the
   * whole rebuilt prompt as a miss that should have been a cache read, which is
   * the opposite of what happened.
   * A usage-gap marks a completed request without a usable prompt count; its
   * numeric fields are placeholders and never included as measured history.
   */
  readonly kind: "request" | "context-reset" | "usage-gap";
}


/** Durable cumulative counts. Context measurements belong to the live runtime. */
export type SessionUsageSnapshot = Pick<SessionUsageTelemetry,
  "byModel" | "turnsCount" | "toolCallsCount" | "lastBucketKey" | "lastUpdated">;
