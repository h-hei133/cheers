import { isRecord } from '../../core/values/record.js';
import { legacyBucketKey } from './identity.js';
import { MAX_RECENT_REQUESTS, type ModelUsageBucket, type SessionUsageSnapshot, type UsageHistoryEntry, type UsageHealth } from './model.js';
import { decodeUsageBucket, decodeUsageHealth, decodeUsageHistory, decodeUsageSnapshot, mergeUsageHealth } from './snapshot.js';

function recoveredCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Recovery is tolerant; the strict decoder remains the admission boundary. */
export function recoverUsageSnapshot(value: unknown): SessionUsageSnapshot | undefined {
  try { return decodeUsageSnapshot(value); } catch { /* Retain independently verifiable records below. */ }
  const knownVersion = isRecord(value) && (value.schemaVersion === undefined || value.schemaVersion === 2);
  const source: Record<string, unknown> = knownVersion && isRecord(value) ? value : {};
  const byModel = Object.create(null) as Record<string, ModelUsageBucket>;
  let rejectedBuckets = 0;
  let rejectedHistoryEntries = 0;
  let invalidSnapshot = !knownVersion || !isRecord(source.byModel);
  if (isRecord(source.byModel)) for (const [storedKey, raw] of Object.entries(source.byModel)) {
    const key = source.schemaVersion === 2 ? storedKey : legacyBucketKey(storedKey);
    try { byModel[key] = decodeUsageBucket(key, raw, source.schemaVersion === 2); }
    catch { rejectedBuckets += 1; }
  }
  const recentRequests: UsageHistoryEntry[] = [];
  if (Array.isArray(source.recentRequests)) {
    rejectedHistoryEntries += Math.max(0, source.recentRequests.length - MAX_RECENT_REQUESTS);
    for (const entry of source.recentRequests.slice(-MAX_RECENT_REQUESTS)) {
      try { recentRequests.push(...decodeUsageHistory([entry])); }
      catch {
        rejectedHistoryEntries += 1;
        // A lost request cannot establish cache continuity across its position.
        recentRequests.push({ promptTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
          bucketKey: '', timestamp: 0, reportedCache: false, kind: 'usage-gap' });
      }
    }
  } else if (source.recentRequests !== undefined) invalidSnapshot = true;
  const counts: Record<string, number> = {};
  for (const field of ['turnsCount', 'toolCallsCount', 'lastUpdated'] as const) {
    counts[field] = recoveredCount(source[field], 0);
    if (counts[field] !== source[field]) invalidSnapshot = true;
  }
  let lastBucketKey = typeof source.lastBucketKey === 'string'
    ? source.schemaVersion === 2 ? source.lastBucketKey : legacyBucketKey(source.lastBucketKey) : '';
  if (typeof source.lastBucketKey !== 'string' || (lastBucketKey && !byModel[lastBucketKey])) {
    lastBucketKey = ''; invalidSnapshot = true;
  }
  let previousHealth: UsageHealth | undefined;
  try { previousHealth = decodeUsageHealth(source.usageHealth); } catch { invalidSnapshot = true; }
  return { schemaVersion: 2, byModel, turnsCount: counts.turnsCount!, toolCallsCount: counts.toolCallsCount!,
    lastUpdated: counts.lastUpdated!, lastBucketKey, recentRequests,
    usageHealth: mergeUsageHealth(previousHealth, { status: 'degraded', rejectedBuckets, rejectedHistoryEntries, invalidSnapshot }) };
}

/** Cumulative counters cannot be silently deleted by a damaged disk bucket. */
export function preserveUsageBaseline(current: SessionUsageSnapshot | undefined, baseline: SessionUsageSnapshot | undefined,
  raw: unknown): SessionUsageSnapshot | undefined {
  if (!baseline) return current;
  if (!current) {
    current = decodeUsageSnapshot(baseline)!;
    current.usageHealth = mergeUsageHealth(current.usageHealth,
      { status: 'degraded', rejectedBuckets: Object.keys(baseline.byModel).length, rejectedHistoryEntries: 0, invalidSnapshot: true });
  }
  let missingBuckets = 0;
  for (const [key, bucket] of Object.entries(baseline.byModel)) {
    if (!current.byModel[key]) { current.byModel[key] = { ...bucket }; missingBuckets += 1; }
  }
  if (missingBuckets) current.usageHealth = mergeUsageHealth(current.usageHealth,
    { status: 'degraded', rejectedBuckets: missingBuckets, rejectedHistoryEntries: 0, invalidSnapshot: false });
  if (current.usageHealth?.invalidSnapshot) {
    const knownSource = isRecord(raw) && (raw.schemaVersion === undefined || raw.schemaVersion === 2) ? raw : {};
    for (const field of ['turnsCount', 'toolCallsCount', 'lastUpdated'] as const) {
      if (recoveredCount(knownSource[field], -1) < 0) current[field] = Math.max(current[field], baseline[field]);
    }
  }
  return current;
}
