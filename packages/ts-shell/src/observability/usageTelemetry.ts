import type { ModelCostRates } from "../core/models/catalog.js";

export type { ModelCostRates };

import type { ModelUsageBucket, SessionUsageTelemetry, UsageHistoryEntry, SessionUsageSnapshot } from "./usage/model.js";
import { decodeUsageSnapshot, mergeUsageDelta } from "./usage/snapshot.js";
export type { ModelUsageBucket, SessionUsageTelemetry, UsageHistoryEntry, SessionUsageSnapshot } from "./usage/model.js";

/**
 * How many requests are kept.
 *
 * Enough to cover a cache's life at a normal pace — the TTL most providers use
 * is minutes, not hours — while keeping the memory this costs bounded for a
 * session that runs all day.
 */
export const MAX_RECENT_REQUESTS = 64;

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
// Weak keys follow the telemetry lifetime; no second session registry to clean up.
const persistedBaselines = new WeakMap<SessionUsageTelemetry, SessionUsageSnapshot>();

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

  // The per-request view, which the buckets cannot provide: they sum, and cache
  // waste is a comparison between one request and the one before it.
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const previous = existing.recentRequests.at(-1);
  const promptTotal = pTokens + cacheRead + cacheWrite;
  if (promptTotal > 0) {
    pushHistory(existing, {
      promptTokens: promptTotal,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      bucketKey: key,
      timestamp: existing.lastUpdated,
      // Sticky: once any request reported cache activity, a later request that
      // reports none is a total miss rather than a provider that cannot cache.
      reportedCache: (previous?.reportedCache ?? false) || cacheRead + cacheWrite > 0,
      kind: "request",
    });
  }

  sessionTelemetries.set(sessionId, existing);
}

/** Append to the bounded history, dropping the oldest entry once it is full. */
function pushHistory(telemetry: SessionUsageTelemetry, entry: UsageHistoryEntry): void {
  telemetry.recentRequests.push(entry);
  const excess = telemetry.recentRequests.length - MAX_RECENT_REQUESTS;
  if (excess > 0) telemetry.recentRequests.splice(0, excess);
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
    recentRequests: [],
  };
}

export function getSessionUsage(sessionId: string): SessionUsageTelemetry {
  return sessionTelemetries.get(sessionId) ?? emptyTelemetry();
}

/**
 * Note that the conversation was rebuilt.
 *
 * Two things follow from that, and they are the same fact seen twice. The live
 * context footprint goes absent, because the last request's prompt size
 * describes a conversation that no longer exists. And the next request starts a
 * new segment for cache accounting, because its prompt shares nothing with the
 * one before it — comparing them would count the whole rebuilt prompt as
 * something that should have been read from cache.
 *
 * One function rather than two because every caller means both: a place that
 * rebuilds the context has to say so to everything that was reasoning about the
 * old one, and a caller that updated only half of that would be wrong in a way
 * nothing would report.
 */
export function markContextUnknown(sessionId: string): void {
  const existing = sessionTelemetries.get(sessionId);
  if (!existing) return;
  existing.lastPromptTokens = 0;
  existing.lastPromptMessageCount = 0;
  pushHistory(existing, {
    promptTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    bucketKey: existing.lastBucketKey,
    timestamp: Date.now(),
    // Carried forward rather than set: a rebuild says nothing about whether the
    // provider caches, so it must not erase what was already learned about that.
    reportedCache: existing.recentRequests.at(-1)?.reportedCache ?? false,
    kind: "context-reset",
  });
}

export function resetSessionUsage(sessionId: string): void {
  sessionTelemetries.delete(sessionId);
}

/** Restore once on activation. Never replace live, possibly unflushed usage. */
export function restoreSessionUsage(sessionId: string, snapshot: unknown): void {
  if (sessionTelemetries.has(sessionId)) return;
  const restored = decodeUsageSnapshot(snapshot);
  if (!restored) return;
  const telemetry = Object.assign(emptyTelemetry(), restored);
  sessionTelemetries.set(sessionId, telemetry);
  persistedBaselines.set(telemetry, decodeUsageSnapshot(restored)!);
}

/**
 * Called inside the existing state lock. Only locally added counts are merged,
 * so another process's writes survive. A failed write keeps the delta pending.
 * This function owns accounting only; the session store owns all I/O.
 */
export function persistSessionUsage(
  sessionId: string,
  current: unknown,
  write: (snapshot: SessionUsageSnapshot | undefined) => void,
): void {
  const live = sessionTelemetries.get(sessionId);
  const snapshot = live
    ? mergeUsageDelta(current, live, persistedBaselines.get(live))
    : decodeUsageSnapshot(current);
  write(snapshot);
  if (live && snapshot) {
    // Keep the context gauge/history local even when another process added cost.
    Object.assign(live, decodeUsageSnapshot(snapshot));
    persistedBaselines.set(live, decodeUsageSnapshot(snapshot)!);
  }
}
