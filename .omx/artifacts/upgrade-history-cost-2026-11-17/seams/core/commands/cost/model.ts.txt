import type { CatalogProvider, ModelCostRates } from '../../models/catalog.js';
import { resolveModelCost } from '../../models/window.js';
import { estimateSessionCost, totalTokens, usageBuckets, USAGE_RATES, type SessionUsageTelemetry } from '../../../observability/usageTelemetry.js';
import { bucketIdentity, bucketRates } from '../../../observability/usage/identity.js';
import { findCacheWaste, summarizeCacheUsage } from '../../../observability/cacheWaste.js';

/** Recorded accounting only; neither the live context gauge nor a provider bill. */
export function costModel(telemetry: SessionUsageTelemetry, catalog: readonly CatalogProvider[]) {
  const rateFor = (provider: string, model: string) => resolveModelCost(catalog, provider, model);
  const destinations = [...new Set(Object.values(telemetry.byModel).flatMap(bucket => bucket.attribution ? [bucket.attribution.endpointId] : []))].sort();
  const buckets = usageBuckets(telemetry).map(([key, bucket]) => {
    const identity = bucketIdentity(key, bucket);
    const published = bucketRates(key, bucket, rateFor);
    const rates: ModelCostRates | undefined = published ?? (bucket.attribution ? undefined : USAGE_RATES);
    const estimate = estimateSessionCost({ ...telemetry, usageHealth: undefined, byModel: { [key]: bucket } }, rateFor);
    const unpricedTokens = rates ? (rates.cacheReadPerMTok === undefined ? bucket.cacheReadTokens : 0)
      + (rates.cacheWritePerMTok === undefined ? bucket.cacheWriteTokens : 0) : bucket.totalTokens;
    const modelLabel = identity.provider ? `${identity.provider}/${identity.model}` : identity.model;
    const label = bucket.attribution ? `${modelLabel} · ${bucket.attribution.origin ?? 'unknown origin'} · destination ${destinations.indexOf(bucket.attribution.endpointId) + 1}` : modelLabel;
    return { key, provider: identity.provider, model: identity.model, label, ...bucket,
      rates: { promptPerMTok: rates?.promptPerMTok ?? null, completionPerMTok: rates?.completionPerMTok ?? null,
        cacheReadPerMTok: rates?.cacheReadPerMTok ?? null, cacheWritePerMTok: rates?.cacheWritePerMTok ?? null },
      rateSource: published ? 'published' as const : rates ? 'assumed' as const : 'unknown' as const,
      rateBasis: bucket.attribution ? 'captured' as const : 'current' as const,
      estimate: { usd: estimate.cost > 0 || estimate.zeroCostSupported ? estimate.cost : null,
        coverage: rates && estimate.fullyAllocated && unpricedTokens === 0 ? 'complete' as const : 'partial' as const,
        unpricedTokens, fullyAllocated: estimate.fullyAllocated },
    };
  });
  const estimate = estimateSessionCost(telemetry, rateFor);
  return { recordedTurns: telemetry.turnsCount, recordedTokens: totalTokens(telemetry), buckets,
    ...(telemetry.usageHealth ? { usageHealth: { ...telemetry.usageHealth } } : {}),
    modelCount: new Set(buckets.map(bucket => JSON.stringify([bucket.provider, bucket.model]))).size,
    estimate: { usd: estimate.cost > 0 || estimate.zeroCostSupported ? estimate.cost : null,
      coverage: !estimate.partial && buckets.every(bucket => bucket.estimate.coverage === 'complete') ? 'complete' as const : 'partial' as const,
      everyRatePublished: estimate.everyRatePublished },
    cache: { usage: summarizeCacheUsage(telemetry.recentRequests), waste: findCacheWaste(telemetry.recentRequests, (provider, model) => {
      const rates = rateFor(provider, model);
      // A missing cache price is not a free cache read for the comparison.
      return rates?.cacheReadPerMTok === undefined ? undefined : rates;
    }),
      retainedEntries: telemetry.recentRequests.length,
      retainedRequests: telemetry.recentRequests.filter(entry => entry.kind === 'request').length },
  };
}

export type CostModel = ReturnType<typeof costModel>;
