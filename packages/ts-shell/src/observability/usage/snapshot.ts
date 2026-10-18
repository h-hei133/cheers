import { isRecord } from "../../core/values/record.js";
import type { ModelUsageBucket, SessionUsageSnapshot } from "./model.js";
import { decodeAttribution, legacyBucketKey } from './identity.js';

const bucketFields = ["promptTokens", "completionTokens", "totalTokens", "cacheReadTokens", "cacheWriteTokens", "turnsCount"] as const;

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Invalid persisted session usage count");
  }
  return value;
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
    if (!isRecord(raw)) throw new Error("Invalid persisted session usage bucket");
    const key = value.schemaVersion === 2 ? storedKey : legacyBucketKey(storedKey);
    const attribution = decodeAttribution(key, value.schemaVersion === 2 ? raw.attribution : undefined);
    const bucket = { ...(attribution ? { attribution } : {}) } as ModelUsageBucket;
    for (const field of bucketFields) bucket[field] = count(raw[field]);
    byModel[key] = bucket;
  }
  return {
    schemaVersion: 2,
    byModel,
    turnsCount: count(value.turnsCount),
    toolCallsCount: count(value.toolCallsCount),
    lastBucketKey: value.schemaVersion === 2 ? value.lastBucketKey : legacyBucketKey(value.lastBucketKey),
    lastUpdated: count(value.lastUpdated),
  };
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
    turnsCount: 0, toolCallsCount: 0, lastBucketKey: "", lastUpdated: 0,
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
  if (live.turnsCount > (baseline?.turnsCount ?? 0) && live.lastUpdated >= merged.lastUpdated) {
    merged.lastBucketKey = live.lastBucketKey;
  }
  merged.lastUpdated = Math.max(merged.lastUpdated, live.lastUpdated);
  return merged;
}
