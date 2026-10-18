import type { ModelCostRates } from "../core/models/catalog.js";
import type { UsageHistoryEntry } from "./usage/model.js";
import { bucketIdentity, bucketRates, cacheIdentity } from './usage/identity.js';

/**
 * What the prompt cache failed to save.
 *
 * Every request resends the conversation, so most of a prompt is text the
 * provider has already seen. Providers charge a fraction of the normal rate for
 * the part they recognize, which makes a miss — prompt that was sent before and
 * charged in full anyway — the one cache number worth reporting: the tokens are
 * the same either way, and only the money differs.
 *
 * Nothing here is inferred from a provider's own hit-rate figure, because there
 * is not one. What is measured is the difference between what the previous
 * request sent and what the current one was charged full price for.
 */

/**
 * Tokens below which a shortfall is not counted.
 *
 * A prompt is cached at breakpoints, so the boundary between cached and not
 * lands somewhere inside the text. A few hundred tokens on the wrong side of it
 * is how the mechanism works, not a failure of it; counting those would bury the
 * real misses in noise.
 */
export const NOISE_FLOOR_TOKENS = 1024;

/** How long an idle gap has to be before it is worth naming as a likely cause. */
export const CACHE_TTL_MS = 5 * 60 * 1000;

/** One request that paid full price for prompt it had already sent. */
export interface CacheMiss {
  /** Prompt tokens that were in the previous request and re-billed in this one. */
  readonly missedTokens: number;
  /** Extra dollars paid against what a cache read would have cost. */
  readonly missedCost: number;
  /** Time since the previous request, which is how a cache expires. */
  readonly idleMs: number;
  /** Whether these tokens were sent to a different model than last time. */
  readonly modelChanged: boolean;
  readonly endpointChanged?: boolean;
}

/** All the misses found in a history, and what they cost. */
export interface CacheWaste {
  readonly missedTokens: number;
  readonly missedCost: number;
  /** How many requests were counted, above the noise floor. */
  readonly missCount: number;
}

/** The misses found, oldest first, one per counted request. */
export interface CacheWasteReport {
  readonly totals: CacheWaste;
  readonly misses: readonly CacheMiss[];
}

/**
 * Rates for one model, or nothing when it publishes none.
 *
 * The cost of a miss is the difference between two rates, so a model with no
 * published prices cannot have one computed for it. Reporting a figure derived
 * from a fallback rate would look measured and would not be.
 */
export type CacheRateLookup = (provider: string, model: string) => ModelCostRates | undefined;

export interface CacheUsageSummary {
  readonly promptTokens: number;
  readonly cacheReadTokens: number;
  readonly hitRate?: number;
  readonly requestCount: number;
}

/**
 * The provider-reported cache hit rate over the retained, cache-accounted
 * requests. Requests without cache accounting are excluded rather than treated
 * as misses: zero can mean a real miss or an unsupported provider, and the
 * telemetry already records that distinction in `reportedCache`.
 */
export function summarizeCacheUsage(
  history: readonly UsageHistoryEntry[],
): CacheUsageSummary {
  const accounted = history.filter((entry) => entry.kind === "request" && entry.reportedCache);
  const promptTokens = accounted.reduce((sum, entry) => sum + entry.promptTokens, 0);
  const cacheReadTokens = accounted.reduce((sum, entry) => sum + entry.cacheReadTokens, 0);
  return {
    promptTokens,
    cacheReadTokens,
    ...(promptTokens > 0 ? { hitRate: (cacheReadTokens / promptTokens) * 100 } : {}),
    requestCount: accounted.length,
  };
}

/** A request worth comparing against, with everything the comparison needs. */
interface Comparable {
  readonly promptTokens: number;
  readonly cacheReadTokens: number;
  /** Full-price prompt: input plus the write premium. */
  readonly paidTokens: number;
  readonly rates: ModelCostRates;
  readonly bucketKey: string;
  readonly modelKey: string;
  readonly attributed: boolean;
  readonly timestamp: number;
}

/**
 * Find every request that should have been a cache read and was not.
 *
 * Takes the recorded history rather than reading anything itself, so the same
 * arithmetic serves a report over a session's recent requests and a test with
 * three entries in it.
 *
 * A request is only comparable against another on the same model: the cache is
 * the provider's, keyed to the model it was built for, so a switch legitimately
 * re-bills the whole prompt. Those are reported as the model having changed
 * rather than silently dropped, because the money was still spent.
 */
export function findCacheWaste(
  history: readonly UsageHistoryEntry[],
  rateFor: CacheRateLookup,
): CacheWasteReport {
  const misses: CacheMiss[] = [];
  let previous: Comparable | undefined;

  for (const entry of history) {
    if (entry.kind !== "request") {
      // A rebuild or unmeasured request breaks continuity. Neither can establish
      // what the next request should have read from cache.
      previous = undefined;
      continue;
    }

    const current = comparable(entry, rateFor);
    // A request with no published rate is stored for the next comparison but
    // never judged: the tokens are known and the money is not.
    const missed = previous && current ? detectMiss(previous, current) : undefined;
    if (missed) misses.push(missed);
    previous = current;
  }

  return {
    totals: {
      missedTokens: misses.reduce((sum, miss) => sum + miss.missedTokens, 0),
      missedCost: misses.reduce((sum, miss) => sum + miss.missedCost, 0),
      missCount: misses.length,
    },
    misses,
  };
}

/**
 * The one request shaped for comparison, or nothing when it cannot be judged.
 *
 * `promptTokens` is the whole prompt the provider was sent, because that is what
 * the next request's cache reads are measured against. `paidTokens` is the part
 * billed at the full rate: input, plus cache writes, which carry their own
 * premium. Those are the only buckets a missed token can land in.
 */
function comparable(entry: UsageHistoryEntry, rateFor: CacheRateLookup): Comparable | undefined {
  if (entry.promptTokens <= 0) return undefined;
  const rates = bucketRates(entry.bucketKey, entry, rateFor);
  if (!rates || rates.cacheReadPerMTok === undefined) return undefined;
  const identity = bucketIdentity(entry.bucketKey, entry);
  const cacheRead = entry.cacheReadTokens;
  return {
    promptTokens: entry.promptTokens,
    cacheReadTokens: cacheRead,
    paidTokens: entry.promptTokens - cacheRead,
    rates,
    bucketKey: cacheIdentity(entry.bucketKey, entry.attribution),
    modelKey: JSON.stringify([identity.provider, identity.model]),
    attributed: entry.attribution !== undefined,
    timestamp: entry.timestamp,
  };
}

/**
 * How much of the previous prompt was re-billed in this one.
 *
 * The prompt can be shorter than last time — after a compaction, or when a turn
 * sent less — so the comparison is against the smaller of the two. Only the part
 * that was actually sent again could have been cached, and charging the current
 * request for tokens it never sent would invent a miss.
 */
function detectMiss(previous: Comparable, current: Comparable): CacheMiss | undefined {
  // A legacy entry never identified an endpoint. Migration cannot establish
  // either continuity or an observed destination switch across that boundary.
  if (previous.attributed !== current.attributed) return undefined;
  const shared = Math.min(previous.promptTokens, current.promptTokens);
  const missedTokens = shared - current.cacheReadTokens;
  if (missedTokens <= NOISE_FLOOR_TOKENS) return undefined;

  // What the miss cost is the gap between the two published rates: those tokens
  // were billed at the full prompt rate when a cache read would have been
  // charged the read rate. Both come from the same model's own prices, so no
  // assumption about the ratio between them is baked in.
  //
  // Clamped at zero. A model that prices reads above the full rate would make a
  // miss a saving, and reporting a negative cost would be arithmetic nobody can
  // act on.
  const extraPerToken = Math.max(0, current.rates.promptPerMTok - (current.rates.cacheReadPerMTok ?? 0));
  return {
    missedTokens,
    missedCost: pricePerMillion(extraPerToken, missedTokens),
    idleMs: Math.max(0, current.timestamp - previous.timestamp),
    modelChanged: current.modelKey !== previous.modelKey,
    ...(current.attributed ? { endpointChanged: current.bucketKey !== previous.bucketKey && current.modelKey === previous.modelKey } : {}),
  };
}

/** A per-million rate applied to a token count, in dollars. */
function pricePerMillion(perMillion: number, tokens: number): number {
  return (perMillion / 1_000_000) * tokens;
}
