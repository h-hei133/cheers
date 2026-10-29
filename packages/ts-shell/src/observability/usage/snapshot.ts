import { isRecord } from "../../core/values/record.js";
import { MAX_RECENT_REQUESTS, type ModelUsageBucket, type SessionUsageSnapshot, type UsageHistoryEntry, type UsageHealth } from "./model.js";
import { decodeAttribution, legacyBucketKey } from './identity.js';

const bucketFields = ["promptTokens", "completionTokens", "totalTokens", "cacheReadTokens", "cacheWriteTokens", "turnsCount"] as const;

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Invalid persisted session usage count");
  }
  return value;
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 16_384;
}

export function decodeUsageHealth(value: unknown): UsageHealth | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.status !== 'degraded' || typeof value.invalidSnapshot !== 'boolean'
    || typeof value.rejectedBuckets !== 'number' || typeof value.rejectedHistoryEntries !== 'number'
    || !Number.isSafeInteger(value.rejectedBuckets) || !Number.isSafeInteger(value.rejectedHistoryEntries)) {
    throw new Error('Invalid persisted session usage health');
  }
  return { status: 'degraded', rejectedBuckets: count(value.rejectedBuckets),
    rejectedHistoryEntries: count(value.rejectedHistoryEntries), invalidSnapshot: value.invalidSnapshot };
}

export function mergeUsageHealth(...values: (UsageHealth | undefined)[]): UsageHealth | undefined {
  const present = values.filter((value): value is UsageHealth => value !== undefined);
  if (!present.length) return undefined;
  return { status: 'degraded', rejectedBuckets: Math.max(...present.map(value => value.rejectedBuckets)),
    rejectedHistoryEntries: Math.max(...present.map(value => value.rejectedHistoryEntries)),
    invalidSnapshot: present.some(value => value.invalidSnapshot) };
}

/** Publication callbacks receive one immutable, already validated value. */
export function freezeUsageSnapshot(snapshot: SessionUsageSnapshot | undefined): void {
  if (!snapshot) return;
  for (const bucket of Object.values(snapshot.byModel)) Object.freeze(bucket);
  for (const entry of snapshot.recentRequests) Object.freeze(entry);
  Object.freeze(snapshot.byModel);
  Object.freeze(snapshot.recentRequests);
  if (snapshot.usageHealth) Object.freeze(snapshot.usageHealth);
  Object.freeze(snapshot);
}

export function decodeUsageBucket(key: string, raw: unknown, attributed: boolean): ModelUsageBucket {
  if (!isRecord(raw)) throw new Error('Invalid persisted session usage bucket');
  const attribution = decodeAttribution(key, attributed ? raw.attribution : undefined);
  const bucket = { ...(attribution ? { attribution } : {}) } as ModelUsageBucket;
  for (const field of bucketFields) bucket[field] = count(raw[field]);
  return bucket;
}

/** Copy and validate at the durable boundary; model keys remain opaque. */
export function decodeUsageSnapshot(value: unknown): SessionUsageSnapshot | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isRecord(value.byModel) || typeof value.lastBucketKey !== "string") {
    throw new Error("Invalid persisted session usage snapshot");
  }
  if (value.schemaVersion !== undefined && value.schemaVersion !== 2) throw new Error('Unsupported session usage schema');
  const byModel = Object.create(null) as Record<string, ModelUsageBucket>;
  for (const [storedKey, raw] of Object.entries(value.byModel)) {
    const key = value.schemaVersion === 2 ? storedKey : legacyBucketKey(storedKey);
    byModel[key] = decodeUsageBucket(key, raw, value.schemaVersion === 2);
  }
  const recentRequests = decodeUsageHistory(value.recentRequests);
  const usageHealth = decodeUsageHealth(value.usageHealth);
  const lastBucketKey = value.schemaVersion === 2 ? value.lastBucketKey : legacyBucketKey(value.lastBucketKey);
  if (lastBucketKey) decodeAttribution(lastBucketKey, byModel[lastBucketKey]?.attribution);
  return {
    schemaVersion: 2,
    ...(usageHealth ? { usageHealth } : {}),
    byModel,
    turnsCount: count(value.turnsCount),
    toolCallsCount: count(value.toolCallsCount),
    lastBucketKey,
    lastUpdated: count(value.lastUpdated),
    recentRequests,
  };
}

export function decodeUsageHistory(value: unknown): UsageHistoryEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_RECENT_REQUESTS) {
    throw new Error("Invalid persisted session usage history");
  }
  return value.map(entry => {
    if (!isRecord(entry) || typeof entry.bucketKey !== "string" || entry.bucketKey.length > 16_384
      || typeof entry.reportedCache !== "boolean"
      || !["request", "context-reset", "usage-gap"].includes(String(entry.kind))) {
      throw new Error("Invalid persisted session usage history entry");
    }
    const promptTokens = count(entry.promptTokens);
    const cacheReadTokens = count(entry.cacheReadTokens);
    const cacheWriteTokens = count(entry.cacheWriteTokens);
    const timestamp = count(entry.timestamp);
    if (entry.purpose !== undefined && !text(entry.purpose)) {
      throw new Error("Invalid persisted session usage purpose");
    }
    if (entry.id !== undefined && !text(entry.id)) {
      throw new Error("Invalid persisted session usage history id");
    }
    const completionTokens = entry.completionTokens === undefined ? undefined : count(entry.completionTokens);
    const attribution = decodeAttribution(entry.bucketKey, entry.attribution);
    return {
      ...(entry.id === undefined ? {} : { id: entry.id }),
      promptTokens,
      cacheReadTokens,
      cacheWriteTokens,
      bucketKey: entry.bucketKey,
      timestamp,
      reportedCache: entry.reportedCache,
      kind: entry.kind as UsageHistoryEntry["kind"],
      ...(completionTokens === undefined ? {} : { completionTokens }),
      ...(entry.purpose === undefined ? {} : { purpose: entry.purpose }),
      ...(attribution ? { attribution } : {}),
    };
  });
}

function sameHistoryEntry(left: UsageHistoryEntry, right: UsageHistoryEntry): boolean {
  if (left.id !== undefined || right.id !== undefined) return left.id === right.id;
  return left.promptTokens === right.promptTokens
    && left.completionTokens === right.completionTokens
    && left.purpose === right.purpose
    && left.cacheReadTokens === right.cacheReadTokens
    && left.cacheWriteTokens === right.cacheWriteTokens
    && left.bucketKey === right.bucketKey
    && left.timestamp === right.timestamp
    && left.reportedCache === right.reportedCache
    && left.kind === right.kind
    && JSON.stringify(left.attribution) === JSON.stringify(right.attribution);
}

function historyOverlap(left: readonly UsageHistoryEntry[], right: readonly UsageHistoryEntry[]): number {
  for (let length = Math.min(left.length, right.length); length > 0; length -= 1) {
    if (left.slice(-length).every((entry, index) => sameHistoryEntry(entry, right[index]!))) return length;
  }
  return 0;
}

/** Merge bounded histories without treating their capped length as a cursor. */
function mergeRecentHistory(
  current: readonly UsageHistoryEntry[],
  live: readonly UsageHistoryEntry[],
  baseline: readonly UsageHistoryEntry[],
): UsageHistoryEntry[] {
  let overlap = historyOverlap(current, live);
  let appended = live.slice(overlap);
  if (overlap === 0) {
    overlap = historyOverlap(baseline, live);
    appended = live.slice(overlap).filter(entry => !current.some(existing => sameHistoryEntry(existing, entry)));
  }
  return [...current, ...appended].slice(-MAX_RECENT_REQUESTS);
}

function addDelta(current: number, live: number, baseline: number): number {
  if (live < baseline || current < baseline) {
    throw new Error("Persisted session usage counters moved backwards");
  }
  return count(current + count(live - baseline));
}

/** Merge cumulative increments, never per-bucket maxima or whole-process totals. */
export function mergeUsageDelta(
  current: unknown,
  live: SessionUsageSnapshot,
  baseline: SessionUsageSnapshot | undefined,
): SessionUsageSnapshot {
  live = decodeUsageSnapshot(live)!;
  baseline = decodeUsageSnapshot(baseline);
  const merged = decodeUsageSnapshot(current) ?? {
    schemaVersion: 2,
    byModel: Object.create(null) as Record<string, ModelUsageBucket>,
    turnsCount: 0, toolCallsCount: 0, lastBucketKey: "", lastUpdated: 0, recentRequests: [],
  };
  for (const [key, bucket] of Object.entries(live.byModel)) {
    const previous = baseline?.byModel[key];
    const result = merged.byModel[key] ?? { ...(bucket.attribution ? { attribution: bucket.attribution } : {}) } as ModelUsageBucket;
    if (JSON.stringify(result.attribution) !== JSON.stringify(bucket.attribution)
      || (previous && JSON.stringify(previous.attribution) !== JSON.stringify(bucket.attribution))) {
      throw new Error('Conflicting session usage attribution');
    }
    for (const field of bucketFields) {
      result[field] = addDelta(result[field] ?? 0, bucket[field], previous?.[field] ?? 0);
    }
    merged.byModel[key] = result;
  }
  merged.turnsCount = addDelta(merged.turnsCount, live.turnsCount, baseline?.turnsCount ?? 0);
  merged.toolCallsCount = addDelta(merged.toolCallsCount, live.toolCallsCount, baseline?.toolCallsCount ?? 0);
  merged.recentRequests = mergeRecentHistory(
    merged.recentRequests,
    live.recentRequests,
    baseline?.recentRequests ?? [],
  );
  if (live.turnsCount > (baseline?.turnsCount ?? 0) && live.lastUpdated >= merged.lastUpdated) {
    merged.lastBucketKey = live.lastBucketKey;
  }
  merged.lastUpdated = Math.max(merged.lastUpdated, live.lastUpdated);
  const usageHealth = mergeUsageHealth(merged.usageHealth, live.usageHealth, baseline?.usageHealth);
  if (usageHealth) merged.usageHealth = usageHealth;
  return merged;
}
