import type { CatalogProvider, ModelCostRates } from '../../models/catalog.js';
import { resolveModelCost } from '../../models/window.js';
import { estimateSessionCost, splitBucketKey, totalTokens, usageBuckets, USAGE_RATES, type SessionUsageTelemetry } from '../../../observability/usageTelemetry.js';
import { findCacheWaste, summarizeCacheUsage } from '../../../observability/cacheWaste.js';

/** Recorded accounting only; neither the live context gauge nor a provider bill. */
export function costModel(telemetry: SessionUsageTelemetry, catalog: readonly CatalogProvider[]) {
  const rateFor = (provider: string, model: string) => resolveModelCost(catalog, provider, model);
  const buckets = usageBuckets(telemetry).map(([key, bucket]) => {
    const identity = splitBucketKey(key);
    const published = rateFor(identity.provider, identity.model);
    const rates: ModelCostRates = published ?? USAGE_RATES;
    const estimate = estimateSessionCost({ ...telemetry, byModel: { [key]: bucket } }, rateFor);
    const unpricedTokens = (rates.cacheReadPerMTok === undefined ? bucket.cacheReadTokens : 0)
      + (rates.cacheWritePerMTok === undefined ? bucket.cacheWriteTokens : 0);
    return { key, ...identity, ...bucket,
      rates: { promptPerMTok: rates.promptPerMTok, completionPerMTok: rates.completionPerMTok,
        cacheReadPerMTok: rates.cacheReadPerMTok ?? null, cacheWritePerMTok: rates.cacheWritePerMTok ?? null },
      rateSource: published ? 'published' as const : 'assumed' as const,
      estimate: { usd: estimate.cost > 0 || estimate.zeroCostSupported ? estimate.cost : null,
        coverage: estimate.fullyAllocated && unpricedTokens === 0 ? 'complete' as const : 'partial' as const,
        unpricedTokens, fullyAllocated: estimate.fullyAllocated },
    };
  });
  const estimate = estimateSessionCost(telemetry, rateFor);
  return { recordedTurns: telemetry.turnsCount, recordedTokens: totalTokens(telemetry), buckets,
    estimate: { usd: estimate.cost > 0 || estimate.zeroCostSupported ? estimate.cost : null,
      coverage: buckets.every(bucket => bucket.estimate.coverage === 'complete') ? 'complete' as const : 'partial' as const,
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
