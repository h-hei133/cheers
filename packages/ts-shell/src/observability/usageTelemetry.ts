import { currentUsage, sessionTelemetries } from './usage/state.js';
import { randomUUID } from 'node:crypto';
import type { ModelCostRates } from "../core/models/catalog.js";
import type { RequestContext } from '../context/request/model.js';
import type { PromptMeasurementIdentity, UsageAttribution } from './usage/model.js';
import { attributedBucketKey, bucketRates, cacheIdentity, decodeAttribution, usageBucketKey } from './usage/identity.js';
export { splitBucketKey, usageBucketKey } from './usage/identity.js';

export type { ModelCostRates };

import { MAX_RECENT_REQUESTS, type ModelUsageBucket, type SessionUsageTelemetry,
  type UsageHistoryEntry, type SessionUsageSnapshot } from "./usage/model.js";
import { decodeUsageSnapshot, mergeUsageDelta } from "./usage/snapshot.js";
export { MAX_RECENT_REQUESTS };
export type { ModelUsageBucket, SessionUsageTelemetry, UsageHistoryEntry, SessionUsageSnapshot } from "./usage/model.js";

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
 * Captured rates remain attached to the request that spent the tokens. Only
 * legacy records use `rateFor` and its labelled fallback; an unknown captured
 * price stays unknown after later catalog changes.
 */
export function estimateSessionCost(
  telemetry: SessionUsageTelemetry,
  rateFor: (provider: string, model: string) => ModelCostRates | undefined,
): { readonly cost: number; readonly everyRatePublished: boolean; readonly zeroCostSupported: boolean;
  readonly fullyAllocated: boolean; readonly usesAssumedRates: boolean; readonly partial: boolean } {
  let cost = 0;
  let everyRatePublished = true;
  let usesAssumedRates = false;
  let unpriced = false;
  let allocated = true;
  let recorded = 0;
  for (const [key, bucket] of Object.entries(telemetry.byModel)) {
    recorded += bucket.totalTokens;
    allocated &&= bucket.totalTokens === bucket.promptTokens + bucket.completionTokens + bucket.cacheReadTokens + bucket.cacheWriteTokens;
    const published = bucketRates(key, bucket, rateFor);
    // A published rate that omits the cache prices is not a published rate for a
    // bucket that spent cache tokens: those are priced at zero below, and a footer
    // claiming the rates are the model's own would be false for the row above it.
    const cacheUnpriced =
      (bucket.cacheReadTokens > 0 && published?.cacheReadPerMTok === undefined) ||
      (bucket.cacheWriteTokens > 0 && published?.cacheWritePerMTok === undefined);
    if (!published || cacheUnpriced) everyRatePublished = false;
    // Legacy records retain the explicitly labelled fallback. A captured absence
    // is evidence that these tokens have no known price, even after catalog edits.
    const rates = published ?? (bucket.attribution ? undefined : USAGE_RATES);
    usesAssumedRates ||= !published && !bucket.attribution;
    unpriced ||= !rates || cacheUnpriced;
    if (rates) cost += estimateUsageCost(bucket, rates);
  }
  // A total-only report supplies no category prices. Zero is supportable only
  // when actual recorded tokens have a complete allocation and published rates.
  return { cost, everyRatePublished, fullyAllocated: allocated, usesAssumedRates, partial: unpriced || !allocated,
    zeroCostSupported: cost === 0 && recorded > 0 && allocated && everyRatePublished };
}



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
    /** Actual destination and immutable price snapshot, captured before dispatch. */
    attribution?: UsageAttribution;
    /** How many messages the request carried, so trailing ones can be counted. */
    promptMessageCount?: number;
    /** Which model/schema the measurement belongs to; absent means provider/model only. */
    promptIdentity?: PromptMeasurementIdentity;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    /** Why this request was sent, when the caller can prove it from the wire context. */
    purpose?: string;
  },
  options: { readonly affectsContext?: boolean; readonly promptMeasured?: boolean;
    readonly scope?: Map<string, SessionUsageTelemetry> } = {},
): void {
  const scope = options.scope ?? sessionTelemetries();
  const existing = currentUsage(sessionId, scope) ?? emptyTelemetry();
  // A report that does not name a model belongs to whichever one last answered:
  // creating a `default` bucket for it would split that model's tokens in two and
  // price them at two different rates.
  const key = usage.attribution ? attributedBucketKey(usage.attribution) : usage.model
    ? usageBucketKey(usage.provider ?? "", usage.model)
    : existing.lastBucketKey || usageBucketKey(usage.provider ?? "", "default");

  const pTokens = usage.promptTokens ?? 0;
  const cTokens = usage.completionTokens ?? 0;
  const promptTotal = pTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
  const promptMeasured = options.promptMeasured ?? (usage.promptTokens !== undefined && Number.isFinite(usage.promptTokens) && usage.promptTokens >= 0);
  const tTokens = usage.totalTokens ?? promptTotal + cTokens;

  // Accumulated into the bucket for the model that answered this request, so a
  // session that switched models keeps each model's tokens under its own rate.
  // `hasOwnProperty` rather than a bare lookup: a bucket key is derived from a
  // model id, and an inherited property would otherwise be treated as one.
  const existingBucket = Object.prototype.hasOwnProperty.call(existing.byModel, key)
    ? existing.byModel[key]
    : undefined;
  const attribution = usage.attribution ? decodeAttribution(key, usage.attribution) : existingBucket?.attribution;
  if (existingBucket && JSON.stringify(existingBucket.attribution) !== JSON.stringify(attribution)) {
    throw new Error('Conflicting session usage attribution');
  }
  const bucket = existingBucket ?? {
    ...(attribution ? { attribution } : {}),
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
  if (options.affectsContext !== false) {
    existing.lastPromptTokens = promptMeasured ? promptTotal : undefined;
    existing.lastPromptMessageCount = promptMeasured ? usage.promptMessageCount ?? 0 : 0;
    existing.lastPromptIdentity = promptMeasured && usage.promptIdentity
      ? { ...usage.promptIdentity, ...(usage.attribution ? { endpointId: usage.attribution.endpointId } : {}) } : undefined;
  }
  existing.turnsCount += 1;
  existing.toolCallsCount += usage.toolCallsCount ?? 0;
  if (options.affectsContext !== false) existing.lastBucketKey = key;
  existing.lastUpdated = Date.now();

  // The per-request view, which the buckets cannot provide: they sum, and cache
  // waste is a comparison between one request and the one before it.
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const previous = existing.recentRequests.at(-1);
  if (options.affectsContext !== false) {
    pushHistory(existing, {
      promptTokens: promptMeasured ? promptTotal : 0,
      completionTokens: cTokens,
      purpose: usage.purpose ?? "turn",
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      bucketKey: key,
      ...(attribution ? { attribution } : {}),
      timestamp: existing.lastUpdated,
      // A price edit keeps cache support, while a destination or model switch
      // cannot establish that the new request supports cache accounting.
      reportedCache: cacheRead + cacheWrite > 0 || Boolean(previous?.reportedCache &&
        cacheIdentity(previous.bucketKey, previous.attribution) === cacheIdentity(key, attribution)),
      kind: promptMeasured ? "request" : "usage-gap",
    });
  }

  scope.set(sessionId, existing);
}

/** One normalized accounting record shared by the runtime and injected session sinks. */
export type SessionUsageRecord = Parameters<typeof recordSessionUsage>[1];

/** Append to the bounded history, dropping the oldest entry once it is full. */
function pushHistory(telemetry: SessionUsageTelemetry, entry: UsageHistoryEntry): void {
  telemetry.recentRequests.push({ ...entry, id: randomUUID() });
  const excess = telemetry.recentRequests.length - MAX_RECENT_REQUESTS;
  if (excess > 0) telemetry.recentRequests.splice(0, excess);
}

/** A session with nothing recorded yet. */
function emptyTelemetry(): SessionUsageTelemetry {
  return {
    schemaVersion: 2,
    // Null-prototyped: bucket keys come from model ids, and an inherited property
    // would be mistaken for a bucket.
    byModel: Object.create(null) as Record<string, ModelUsageBucket>,
    lastPromptTokens: undefined,
    lastPromptMessageCount: 0,
    lastPromptIdentity: undefined,
    turnsCount: 0,
    toolCallsCount: 0,
    lastBucketKey: "",
    lastUpdated: Date.now(),
    recentRequests: [],
  };
}

/**
 * The measured prompt, only while the identity that produced it still applies.
 *
 * A measurement from another model, endpoint, schema or system prompt is not a
 * slightly wrong number — it is a number about a different request.
 */
export function measuredPromptContext(sessionId: string, expected: {
  readonly provider: string; readonly model: string; readonly endpoint?: string;
  readonly schemaDigest?: string; readonly systemDigest?: string;
  readonly historyDigest?: string;
  readonly wireHistoryDigest?: string;
  readonly replayBinding?: string;
  readonly endpointId?: string;
}, options: { readonly requireExpectedIdentity?: boolean } = {}): { readonly tokens: number; readonly messageCount: number } | undefined {
  const telemetry = getSessionUsage(sessionId);
  const identity = telemetry.lastPromptIdentity;
  if (telemetry.lastPromptTokens === undefined) return undefined;
  // A record written before identity existed is still the latest measurement;
  // model changes after it clear the value through invalidatePromptMeasurement.
  if (!identity) {
    return options.requireExpectedIdentity
      ? undefined
      : { tokens: telemetry.lastPromptTokens, messageCount: telemetry.lastPromptMessageCount };
  }
  if (identity.provider !== expected.provider || identity.model !== expected.model) return undefined;
  // A recorded identity field is evidence of request-specific scope. If the
  // caller cannot produce the same live field, it cannot prove the measurement
  // still applies; a provider/model-only query is not sufficient.
  if (identity.endpoint !== undefined && expected.endpoint === undefined) return undefined;
  if (identity.historyDigest !== undefined && expected.historyDigest === undefined) return undefined;
  if (identity.wireHistoryDigest !== undefined && expected.wireHistoryDigest === undefined) return undefined;
  if (identity.replayBinding !== undefined && expected.replayBinding === undefined) return undefined;
  if (identity.endpointId !== undefined && expected.endpointId === undefined) return undefined;
  // A complete recorded identity cannot be checked against a provider/model-only
  // query. Returning it here would let the status band present an old schema or
  // system prompt as the current request.
  if (identity.schemaDigest !== undefined || identity.systemDigest !== undefined) {
    if (expected.schemaDigest === undefined || expected.systemDigest === undefined) return undefined;
  }
  if (options.requireExpectedIdentity) {
    if (expected.endpoint === undefined || expected.schemaDigest === undefined || expected.systemDigest === undefined) return undefined;
    if (identity.endpoint !== expected.endpoint) return undefined;
    if (identity.schemaDigest !== expected.schemaDigest) return undefined;
    if (identity.systemDigest !== expected.systemDigest) return undefined;
  }
  if (expected.endpoint !== undefined && identity.endpoint !== undefined && identity.endpoint !== expected.endpoint) return undefined;
  if (expected.schemaDigest !== undefined && identity.schemaDigest !== undefined && identity.schemaDigest !== expected.schemaDigest) return undefined;
  if (expected.systemDigest !== undefined && identity.systemDigest !== undefined && identity.systemDigest !== expected.systemDigest) return undefined;
  if (expected.historyDigest !== undefined && identity.historyDigest !== expected.historyDigest) return undefined;
  if (expected.wireHistoryDigest !== undefined && identity.wireHistoryDigest !== expected.wireHistoryDigest) return undefined;
  if (expected.replayBinding !== undefined && identity.replayBinding !== expected.replayBinding) return undefined;
  if (expected.endpointId !== undefined && identity.endpointId !== expected.endpointId) return undefined;
  if (identity.wireHistoryDigest !== undefined
    && (!Number.isSafeInteger(identity.wireMessageCount) || (identity.wireMessageCount ?? -1) < 0)) return undefined;
  return { tokens: telemetry.lastPromptTokens,
    messageCount: identity.wireHistoryDigest === undefined ? telemetry.lastPromptMessageCount : identity.wireMessageCount! };
}

/** A model or schema change makes the live count stale without erasing request evidence. */
export function invalidatePromptMeasurement(sessionId: string): void {
  const existing = sessionTelemetries().get(sessionId);
  if (!existing) return;
  existing.lastPromptTokens = undefined;
  existing.lastPromptMessageCount = 0;
  existing.lastPromptIdentity = undefined;
}

export function getSessionUsage(sessionId: string): SessionUsageTelemetry {
  return currentUsage(sessionId) ?? emptyTelemetry();
}

export function recordRequestContext(sessionId: string, context: RequestContext): void {
  const telemetry = sessionTelemetries().get(sessionId) ?? emptyTelemetry();
  telemetry.requestContext = context;
  sessionTelemetries().set(sessionId, telemetry);
}

/** An accepted request has no current measurement until its usage arrives. */
export function clearContextUsage(sessionId: string): void {
  const existing = sessionTelemetries().get(sessionId);
  if (!existing) return;
  existing.lastPromptTokens = undefined;
  existing.lastPromptMessageCount = 0;
  existing.lastPromptIdentity = undefined;
}

/**
 * Note that context was rebuilt or an accepted request lacked prompt usage.
 *
 * Both invalidate the live measurement and break cache comparison continuity.
 * The history retains the reason; missing usage never claims that compaction
 * happened, and neither event adds measured tokens or requests to the totals.
 */
export function markContextUnknown(sessionId: string, kind: 'context-reset' | 'usage-gap' = 'context-reset'): void {
  const existing = sessionTelemetries().get(sessionId);
  if (!existing) return;
  if (kind === 'context-reset') delete existing.requestContext;
  clearContextUsage(sessionId);
  pushHistory(existing, {
    promptTokens: 0,
    completionTokens: 0,
    purpose: kind,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    bucketKey: existing.lastBucketKey,
    timestamp: Date.now(),
    // Carried forward rather than set: a rebuild says nothing about whether the
    // provider caches, so it must not erase what was already learned about that.
    reportedCache: existing.recentRequests.at(-1)?.reportedCache ?? false,
    kind,
  });
}

export function resetSessionUsage(sessionId: string): void {
  sessionTelemetries().delete(sessionId);
}

/** Restore once on activation. Never replace live, possibly unflushed usage. */
export function restoreSessionUsage(sessionId: string, snapshot: unknown): void {
  if (currentUsage(sessionId)) return;
  const restored = decodeUsageSnapshot(snapshot);
  if (!restored) return;
  const telemetry = Object.assign(emptyTelemetry(), restored);
  sessionTelemetries().set(sessionId, telemetry);
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
  scope = sessionTelemetries(),
): void {
  const live = currentUsage(sessionId, scope);
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
