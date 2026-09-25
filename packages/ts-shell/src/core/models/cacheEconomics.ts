import type { ModelCostRates } from "./catalog.js";

/**
 * Whether keeping a prompt cached is worth what it costs.
 *
 * A provider keeps the front of a conversation cached for a while, and a request
 * whose prefix matches pays a reduced rate for it. Once that window lapses the
 * next request pays full price for the whole prefix again. Refreshing it just
 * before it lapses costs a little and saves that, but only when another request
 * is likely enough to arrive first — otherwise the refresh pays for a cache
 * entry nobody reads.
 *
 * So the decision is arithmetic rather than a heuristic, and this module is the
 * arithmetic. It decides; it does not send anything, and it does not know how to
 * reach a provider. Keeping the decision separate is what makes it testable
 * without a network, and what keeps the sending side free of economics.
 *
 * Nothing here runs when the model publishes no prices. The saving cannot be
 * computed without them, and a warmer that guessed would spend real money on a
 * benefit it invented — so an unpriced model declines, and says why.
 */

/** The modes a session can run in. */
export const CACHE_WARMING_MODES = ["off", "streaming", "idle"] as const;

export type CacheWarmingMode = (typeof CACHE_WARMING_MODES)[number];

/**
 * What a session does when it was told nothing.
 *
 * Refreshing while a run is under way is the case that pays for itself: the next
 * request is coming in seconds and the prefix is certainly the same. Refreshing
 * while the user is away is a bet on them returning before the window lapses,
 * and a bet is not something to make on someone's behalf by default.
 */
export const DEFAULT_CACHE_WARMING_MODE: CacheWarmingMode = "streaming";

/** Whether a session is working or waiting. */
export type WarmingPhase = "streaming" | "idle";

/**
 * The least a refresh must be expected to save before it is sent.
 *
 * A floor rather than zero because the estimate is an estimate: below a few
 * cents the difference between the model and reality is the same size as the
 * benefit, and a decision that cannot be distinguished from noise should not be
 * spending money.
 */
export const MINIMUM_EXPECTED_SAVINGS = 0.05;

/**
 * How likely another request is while the session sits idle.
 *
 * A fixed number rather than a measured one. Measuring it per session would
 * mean keeping a history of gaps to predict the next one from a handful of
 * samples, and the estimate that produced was not better than this constant —
 * the same conclusion the reference reached, and the reason its value is the
 * one used here.
 */
export const IDLE_CONTINUATION_PROBABILITY = 0.15;

/** A mode from stored or configured input, falling back to the default. */
export function resolveCacheWarmingMode(value: unknown): CacheWarmingMode {
  return typeof value === "string" && (CACHE_WARMING_MODES as readonly string[]).includes(value)
    ? (value as CacheWarmingMode)
    : DEFAULT_CACHE_WARMING_MODE;
}

/**
 * How long to wait before refreshing, or nothing when the window is too short.
 *
 * Nine tenths of the window, so the refresh lands before it lapses rather than
 * on the boundary where a little clock skew makes it a full-price rewrite. A
 * window of ten seconds or less has no useful margin left after that, so it is
 * declined outright instead of being scheduled for the same instant it expires.
 */
export function cacheWarmingDelayMs(ttlMs: number): number | undefined {
  if (!Number.isFinite(ttlMs) || ttlMs <= 10_000) return undefined;
  return Math.max(1, Math.floor(Math.min(ttlMs * 0.9, ttlMs - 10_000)));
}

export interface CacheWarmingInput {
  /** The rates the model publishes, when it publishes any. */
  readonly cost?: ModelCostRates;
  /** Tokens in the prefix that would be kept warm. */
  readonly promptTokens: number;
  readonly phase: WarmingPhase;
}

export interface CacheWarmingDecision {
  /** What refreshing would cost. */
  readonly warmCost: number;
  /** What letting the window lapse would cost, over and above a cache hit. */
  readonly missCost: number;
  readonly continuationProbability: number;
  readonly expectedSavings: number;
  /**
   * Whether the arithmetic could be done at all.
   *
   * False when the model publishes no prices or the prefix is empty. Kept apart
   * from the action because "not worth it" and "cannot tell" are different
   * answers, and only one of them is a reason to keep the feature switched on.
   */
  readonly economicsAvailable: boolean;
  readonly action: "warm" | "stop";
}

/**
 * Whether to refresh, and on what numbers.
 *
 * The comparison is between two futures: pay a little now to keep the prefix
 * cached, or pay more later if another request arrives to find it gone. The
 * second term is weighted by how likely that arrival is, which is the whole
 * difference between the two phases.
 */
export function evaluateCacheWarming(input: CacheWarmingInput): CacheWarmingDecision {
  const tokens = Math.max(0, Math.floor(input.promptTokens));
  const cost = input.cost;
  const continuationProbability =
    input.phase === "idle" ? IDLE_CONTINUATION_PROBABILITY : 1;

  if (!cost || tokens === 0) {
    return {
      warmCost: 0,
      missCost: 0,
      continuationProbability,
      expectedSavings: 0,
      economicsAvailable: false,
      action: "stop",
    };
  }

  const cacheHitCost = pricePerMillion(cost.cacheReadPerMTok, tokens);
  // A model that publishes a cache-write rate pays that to establish the entry;
  // one that does not is charged the ordinary input rate for the same tokens.
  const cacheMissCost =
    cost.cacheWritePerMTok !== undefined
      ? pricePerMillion(cost.cacheWritePerMTok, tokens)
      : pricePerMillion(cost.promptPerMTok, tokens);
  const warmCost =
    pricePerMillion(cost.cacheReadPerMTok ?? cost.promptPerMTok, tokens) +
    pricePerMillion(cost.completionPerMTok, 1);
  const missCost = Math.max(0, cacheMissCost - cacheHitCost);
  const expectedSavings = continuationProbability * missCost - warmCost;
  // Both sides zero means the model is priced at nothing, which is not a
  // decision this can make: treating it as "not worth it" would be as invented
  // as treating it as "free".
  const economicsAvailable = cacheHitCost > 0 || cacheMissCost > 0;

  return {
    warmCost,
    missCost,
    continuationProbability,
    expectedSavings,
    economicsAvailable,
    action: economicsAvailable && expectedSavings >= MINIMUM_EXPECTED_SAVINGS ? "warm" : "stop",
  };
}

/** What the tokens cost at a rate quoted per million. */
function pricePerMillion(perMillion: number | undefined, tokens: number): number {
  if (perMillion === undefined || !Number.isFinite(perMillion)) return 0;
  return (perMillion * tokens) / 1_000_000;
}

/**
 * Why warming stopped, in terms a user could act on.
 *
 * Nothing is sent when a decision says stop, so a feature that is switched on
 * and doing nothing is indistinguishable from one that is broken unless the
 * reason is available to show.
 */
export function cacheWarmingStopReason(decision: CacheWarmingDecision): string | undefined {
  if (decision.action === "warm") return undefined;
  if (!decision.economicsAvailable) {
    return "the model publishes no prices, so the saving cannot be computed";
  }
  return `the expected saving (${decision.expectedSavings.toFixed(4)}) is below the threshold`;
}
