import type { ModelCostRates } from "../core/models/catalog.js";
import type { UsageHistoryEntry } from "./usage/model.js";
import { bucketIdentity, bucketRates, cacheIdentity } from './usage/identity.js';

/**
 * Estimated prompt overlap and extra cost against a cache read.
 *
 * Recorded prompt and cache-read counts bound potential overlap with the prior
 * request. They do not establish identical text, provider cache eligibility, or
 * an invoice. The current paid categories and captured prices supply an estimate
 * of the extra cost that overlap could have incurred.
 */

/**
 * Tokens below which a shortfall is not counted.
 *
 * Small differences can reflect tokenization or cache granularity. This floor
 * is a reporting heuristic, not an observed provider cache contract.
 */
export const NOISE_FLOOR_TOKENS = 1024;

/** Idle-gap heuristic for suggesting possible expiry; no provider TTL is measured. */
export const CACHE_TTL_MS = 5 * 60 * 1000;

/** One request with a material estimated shortfall in cache reads. */
export interface CacheMiss {
  /** Potential overlapping prompt tokens beyond the current reported cache reads. */
  readonly missedTokens: number;
  /** Estimated extra dollars against a cache read, using the current paid categories. */
  readonly missedCost: number;
  /** Time since the previous request; expiry remains a possible explanation. */
  readonly idleMs: number;
  /** Whether the selected model changed since the previous request. */
  readonly modelChanged: boolean;
  readonly endpointChanged?: boolean;
}

/** All estimated shortfalls found in a history, and their estimated cost. */
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
 * as misses. Current category evidence distinguishes an observed zero from an
 * omitted field; sticky historical activity cannot establish that evidence.
 */
export function summarizeCacheUsage(
  history: readonly UsageHistoryEntry[],
): CacheUsageSummary {
  const accounted = history.filter((entry) => entry.kind === "request"
    && cacheCategoryMeasured(entry.cacheReadTokens, entry.cacheReadReported));
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
  /** Weighted rate of observed ordinary input and cache writes, per million tokens. */
  readonly paidPerMTok: number;
  readonly rates: ModelCostRates;
  readonly bucketKey: string;
  readonly modelKey: string;
  readonly attributed: boolean;
  readonly timestamp: number;
}

/** Older snapshots prove positive activity only; their zero counts lack current category evidence. */
function cacheCategoryMeasured(tokens: number, reported: boolean | undefined): boolean {
  return Number.isFinite(tokens) && tokens >= 0 && (reported ?? tokens > 0);
}

/**
 * Estimate material cache-read shortfalls over comparable recorded requests.
 *
 * Takes the recorded history rather than reading anything itself, so the same
 * arithmetic serves a report over a session's recent requests and a test with
 * three entries in it.
 *
 * Proven destination/model changes are retained as context. They do not prove
 * a cache defect or identical prompt content across those requests.
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
    // Missing current cache-read evidence or paid-category prices cannot supply
    // a dollar estimate or establish a comparable request across the gap.
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

/** Estimate a cache-read shortfall for the most recent comparable request. */
export function detectLatestCacheMiss(
  history: readonly UsageHistoryEntry[],
  rateFor: CacheRateLookup,
): CacheMiss | undefined {
  if (history.length < 2) return undefined;
  const previousEntry = history.at(-2)!;
  const currentEntry = history.at(-1)!;
  if (previousEntry.kind !== "request" || currentEntry.kind !== "request") return undefined;
  const previous = comparable(previousEntry, rateFor);
  const current = comparable(currentEntry, rateFor);
  return previous && current ? detectMiss(previous, current) : undefined;
}

/** Render a single-line human-readable warning for a detected prompt cache miss. */
export function formatCacheMissNotice(miss: CacheMiss): string {
  const tokens = miss.missedTokens.toLocaleString("en-US");
  const cost = miss.missedCost > 0 ? ` (+$${miss.missedCost.toFixed(4)})` : "";
  const cause = miss.modelChanged
    ? " [model changed]"
    : miss.endpointChanged
      ? " [endpoint changed]"
      : miss.idleMs > CACHE_TTL_MS
        ? ` [idle ${Math.round(miss.idleMs / 1000)}s; possible expiry]`
        : "";
  return `Estimated cache miss: ${tokens} overlapping prompt tokens${cost}${cause}.`;
}

/** Return a turn-end estimate when the latest comparable request had a material shortfall. */
export function turnCacheMissNotice(
  history: readonly UsageHistoryEntry[],
  rateFor: CacheRateLookup,
): string | undefined {
  const miss = detectLatestCacheMiss(history, rateFor);
  if (!miss || miss.missedCost <= 0) return undefined;
  return formatCacheMissNotice(miss);
}

/**
 * The one request shaped for comparison, or nothing when it cannot be judged.
 *
 * `promptTokens` is the recorded whole prompt. Ordinary input and cache writes
 * supply a weighted paid rate for allocating cost to potential overlap. A paid
 * category with no captured price cannot supply a dollar estimate.
 */
function comparable(entry: UsageHistoryEntry, rateFor: CacheRateLookup): Comparable | undefined {
  if (entry.promptTokens <= 0 || !cacheCategoryMeasured(entry.cacheReadTokens, entry.cacheReadReported)
    || !Number.isFinite(entry.cacheWriteTokens) || entry.cacheWriteTokens < 0) return undefined;
  const rates = bucketRates(entry.bucketKey, entry, rateFor);
  if (!rates || rates.cacheReadPerMTok === undefined) return undefined;
  const identity = bucketIdentity(entry.bucketKey, entry);
  const cacheRead = entry.cacheReadTokens;
  const paidTokens = entry.promptTokens - cacheRead;
  const inputTokens = paidTokens - entry.cacheWriteTokens;
  if (inputTokens < 0 || (entry.cacheWriteTokens > 0
    && (!cacheCategoryMeasured(entry.cacheWriteTokens, entry.cacheWriteReported) || rates.cacheWritePerMTok === undefined))) return undefined;
  return {
    promptTokens: entry.promptTokens,
    cacheReadTokens: cacheRead,
    paidPerMTok: paidTokens > 0
      ? (inputTokens * rates.promptPerMTok + entry.cacheWriteTokens * (rates.cacheWritePerMTok ?? 0)) / paidTokens : 0,
    rates,
    bucketKey: cacheIdentity(entry.bucketKey, entry.attribution),
    modelKey: JSON.stringify([identity.provider, identity.model]),
    attributed: entry.attribution !== undefined,
    timestamp: entry.timestamp,
  };
}

/**
 * Estimate shared prompt counts beyond the current reported cache reads.
 *
 * The prompt can be shorter than last time, so potential overlap is bounded by
 * the smaller recorded count. Counts alone do not identify which text was shared.
 */
function detectMiss(previous: Comparable, current: Comparable): CacheMiss | undefined {
  // A legacy entry never identified an endpoint. Migration cannot establish
  // either continuity or an observed destination switch across that boundary.
  if (previous.attributed !== current.attributed) return undefined;
  const shared = Math.min(previous.promptTokens, current.promptTokens);
  const missedTokens = shared - current.cacheReadTokens;
  if (missedTokens <= NOISE_FLOOR_TOKENS) return undefined;

  // Allocate potential overlap using the current paid buckets' weighted rate.
  // Input/write distribution within that overlap is unknown, so this remains an
  // estimate rather than a measured re-billing or an invoice adjustment.
  //
  // A read price above the weighted paid rate supplies no positive extra cost.
  const extraPerToken = Math.max(0, current.paidPerMTok - current.rates.cacheReadPerMTok!);
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
