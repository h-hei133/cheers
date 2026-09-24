import type { ModelCostRates } from "../core/models/catalog.js";

export type { ModelCostRates };

/**
 * What one model was used for, within a session.
 *
 * Usage is bucketed by model because a session can switch models partway through
 * and the rates differ. A single flat record meant the newest model's rate was
 * applied to every token the session had ever spent, so `/cost` reported an
 * amount nobody would be billed: the counts were measured correctly and then
 * attributed to the wrong model.
 */
export interface ModelUsageBucket {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** How many requests this model answered. */
  turnsCount: number;
}

export interface SessionUsageTelemetry {
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
   * Prompt tokens of the most recent request. This, not the cumulative total, is
   * the session's live context footprint: every request resends the whole
   * conversation, so the sum across turns counts the same context many times over.
   */
  lastPromptTokens: number;
  /**
   * How many messages that request carried.
   *
   * The measured count only covers what was sent. Anything the conversation
   * gained afterwards is not in the provider's number, so the two have to be
   * added together before either can answer whether the next request fits.
   */
  lastPromptMessageCount: number;
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

/** A bucket key: the provider that served the request, and the model that answered. */
export function usageBucketKey(provider: string, model: string): string {
  // No provider recorded means the key is just the model. Keeping the separator
  // would render every such bucket as `/model` in the report, which reads like a
  // missing value rather than an unknown one.
  return provider ? `${provider}/${model}` : model;
}

/**
 * Split a bucket key back into its parts.
 *
 * The model can contain slashes — `deepseek-ai/DeepSeek-V4-Flash` is a real id —
 * so the provider is everything before the first one and the model is the rest.
 */
export function splitBucketKey(key: string): { readonly provider: string; readonly model: string } {
  const separator = key.indexOf("/");
  return separator === -1
    ? { provider: "", model: key }
    : { provider: key.slice(0, separator), model: key.slice(separator + 1) };
}

/** Per-million-token rates used for the session cost estimate. */
export const USAGE_RATES = { promptPerMTok: 0.14, completionPerMTok: 0.28 } as const;

/**
 * Estimated spend for a session's recorded usage, in US dollars.
 *
 * `rates` comes from the model catalog when the model publishes its prices. The
 * constant below is the fallback for the models that do not, and callers must say
 * which one they used: an estimate that does not name its rate is indistinguishable
 * from a measured bill.
 */
export function estimateUsageCost(
  bucket: ModelUsageBucket,
  rates: ModelCostRates = USAGE_RATES,
): number {
  return (
    (bucket.promptTokens / 1_000_000) * rates.promptPerMTok +
    (bucket.completionTokens / 1_000_000) * rates.completionPerMTok +
    (bucket.cacheReadTokens / 1_000_000) * (rates.cacheReadPerMTok ?? 0) +
    (bucket.cacheWriteTokens / 1_000_000) * (rates.cacheWritePerMTok ?? 0)
  );
}

/**
 * Every bucket in a session, newest activity last, with its model id.
 *
 * Sorted by name so the output is stable between runs: a session that used two
 * models should read the same way twice, and object key order is not a promise.
 */
export function usageBuckets(
  telemetry: SessionUsageTelemetry,
): readonly (readonly [string, ModelUsageBucket])[] {
  return Object.entries(telemetry.byModel).sort(([left], [right]) => left.localeCompare(right));
}

/** One bucket's tokens summed across every model, for a session-level figure. */
export function totalTokens(telemetry: SessionUsageTelemetry): number {
  return Object.values(telemetry.byModel).reduce((sum, bucket) => sum + bucket.totalTokens, 0);
}

/**
 * Estimated session spend, summed across the models that answered.
 *
 * `rateFor` supplies the published rates for a model, or nothing when the model
 * does not publish any — in which case the fallback applies and the caller is
 * expected to say so. Taking a lookup rather than a rate keeps this module free
 * of the catalog, which it does not otherwise import.
 */
export function estimateSessionCost(
  telemetry: SessionUsageTelemetry,
  rateFor: (provider: string, model: string) => ModelCostRates | undefined,
): { readonly cost: number; readonly everyRatePublished: boolean } {
  let cost = 0;
  let everyRatePublished = true;
  for (const [key, bucket] of Object.entries(telemetry.byModel)) {
    const { provider, model } = splitBucketKey(key);
    const published = rateFor(provider, model);
    // A published rate that omits the cache prices is not a published rate for a
    // bucket that spent cache tokens: those are priced at zero below, and a footer
    // claiming the rates are the model's own would be false for the row above it.
    const cacheUnpriced =
      (bucket.cacheReadTokens > 0 && published?.cacheReadPerMTok === undefined) ||
      (bucket.cacheWriteTokens > 0 && published?.cacheWritePerMTok === undefined);
    if (!published || cacheUnpriced) everyRatePublished = false;
    cost += estimateUsageCost(bucket, published ?? USAGE_RATES);
  }
  return { cost, everyRatePublished };
}



const sessionTelemetries: Map<string, SessionUsageTelemetry> = new Map();

export function recordSessionUsage(
  sessionId: string,
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    toolCallsCount?: number;
    model?: string;
    /** Which provider served the request; part of the bucket key. */
    provider?: string;
    /** How many messages the request carried, so trailing ones can be counted. */
    promptMessageCount?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  },
): void {
  const existing = sessionTelemetries.get(sessionId) ?? emptyTelemetry();
  // A report that does not name a model belongs to whichever one last answered:
  // creating a `default` bucket for it would split that model's tokens in two and
  // price them at two different rates.
  const key = usage.model
    ? usageBucketKey(usage.provider ?? "", usage.model)
    : existing.lastBucketKey || usageBucketKey(usage.provider ?? "", "default");

  const pTokens = usage.promptTokens ?? 0;
  const cTokens = usage.completionTokens ?? 0;
  const tTokens = usage.totalTokens ?? pTokens + cTokens;

  // Accumulated into the bucket for the model that answered this request, so a
  // session that switched models keeps each model's tokens under its own rate.
  // `hasOwnProperty` rather than a bare lookup: a bucket key is derived from a
  // model id, and an inherited property would otherwise be treated as one.
  const existingBucket = Object.prototype.hasOwnProperty.call(existing.byModel, key)
    ? existing.byModel[key]
    : undefined;
  const bucket = existingBucket ?? {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    turnsCount: 0,
  };
  bucket.promptTokens += pTokens;
  bucket.completionTokens += cTokens;
  bucket.totalTokens += tTokens;
  bucket.cacheReadTokens += usage.cacheReadTokens ?? 0;
  bucket.cacheWriteTokens += usage.cacheWriteTokens ?? 0;
  bucket.turnsCount += 1;
  existing.byModel[key] = bucket;

  // Session-level fields that are not per-model: the context gauge describes the
  // conversation, not the model that last read it.
  if (pTokens > 0) {
    existing.lastPromptTokens = pTokens;
    existing.lastPromptMessageCount = usage.promptMessageCount ?? 0;
  }
  existing.turnsCount += 1;
  existing.toolCallsCount += usage.toolCallsCount ?? 0;
  existing.lastBucketKey = key;
  existing.lastUpdated = Date.now();

  sessionTelemetries.set(sessionId, existing);
}

/** A session with nothing recorded yet. */
function emptyTelemetry(): SessionUsageTelemetry {
  return {
    // Null-prototyped: bucket keys come from model ids, and an inherited property
    // would be mistaken for a bucket.
    byModel: Object.create(null) as Record<string, ModelUsageBucket>,
    lastPromptTokens: 0,
    lastPromptMessageCount: 0,
    turnsCount: 0,
    toolCallsCount: 0,
    lastBucketKey: "",
    lastUpdated: Date.now(),
  };
}

export function getSessionUsage(sessionId: string): SessionUsageTelemetry {
  return sessionTelemetries.get(sessionId) ?? emptyTelemetry();
}

/**
 * Forget the live context footprint without touching the totals. After a
 * compaction the last request's prompt size describes a context that no longer
 * exists, so the gauge goes absent until the next response reports a real one.
 */
export function markContextUnknown(sessionId: string): void {
  const existing = sessionTelemetries.get(sessionId);
  if (existing) {
    existing.lastPromptTokens = 0;
    existing.lastPromptMessageCount = 0;
  }
}

export function resetSessionUsage(sessionId: string): void {
  sessionTelemetries.delete(sessionId);
}
