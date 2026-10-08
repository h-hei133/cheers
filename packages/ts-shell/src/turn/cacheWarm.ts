import type { ProviderUsage } from "./completion.js";
import {
  cacheWarmingDelayMs,
  evaluateCacheWarming,
  resolveCacheWarmingMode,
  type CacheWarmingDecision,
  type CacheWarmingMode,
} from "../core/models/cacheEconomics.js";
import type { ModelCostRates } from "../core/models/catalog.js";
import type { SentRequest } from "../provider/request/sentRequest.js";
import { ModelAdmissionError } from '../core/agent/request/model.js';

/**
 * Keeping a prompt cached between requests.
 *
 * The arithmetic lives in `core/models/cacheEconomics`; this is what acts on it. The
 * split matters because the decision is pure and can be reasoned about on its
 * own, while this has to deal with time: a window that lapses, a run that ends
 * before the refresh is due, a conversation that changed underneath it.
 *
 * Two phases, and the difference is who is waiting:
 *
 *   - While a run is under way the next request is certainly coming, so a
 *     refresh that keeps the prefix cached is paid for by a saving that is about
 *     to happen.
 *   - Once the run settles, the session is waiting on a person. Whether they
 *     come back before the window lapses is a guess, and the arithmetic weighs
 *     it as one.
 *
 * A refresh that lands after the window lapsed is worse than none: it pays a
 * full-price write for a prefix that was already lost. So every reason to stop —
 * a changed conversation, a missed deadline, an age limit — is checked before
 * the request goes out, not after.
 */

/**
 * How long a settled session may keep refreshing.
 *
 * Past this the user is not between turns, they have walked away, and a session
 * left open overnight should not spend the night making requests nobody is
 * waiting for.
 */
const MAX_IDLE_AGE_MS = 30 * 60_000;

/**
 * How long a running session may keep refreshing.
 *
 * Generous, because a run that is genuinely working is exactly when refreshing
 * pays. It exists to bound the case where a run is stuck rather than busy.
 */
const MAX_STREAMING_AGE_MS = 60 * 60_000;

export interface CacheWarmingOptions {
  readonly mode: CacheWarmingMode | undefined;
  /** The rates the model publishes, when it publishes any. */
  readonly cost?: ModelCostRates;
  readonly promptCache?: { readonly short?: number; readonly long?: number };
  /**
   * Send the refresh.
   *
   * Handed the request that was actually sent, because a refresh is only a
   * refresh if the bytes match: the cache is keyed on the request's own prefix,
   * so anything rebuilt from the session's history arrives as a different one.
   * Supplied rather than built here because sending is a model call, and this
   * module has no business knowing how to reach a provider.
   */
  readonly refresh: (sent: SentRequest, signal: AbortSignal) => Promise<ProviderUsage | void>;
  /** A prefix whose output controls cannot be lowered must remain unscheduled. */
  readonly canRefresh?: (sent: SentRequest) => boolean;
  readonly isCurrent?: () => boolean;
  /** Successful usage belongs to this generation only, never a replaced request. */
  readonly onUsage?: (usage: ProviderUsage) => void;
  /** Told what was decided, so a surface can explain a session that is quiet. */
  readonly onDecision?: (decision: CacheWarmingDecision, stopReason?: string) => void;
  /** The clock, injectable so a test does not have to wait out a window. */
  readonly now?: () => number;
}

export interface CacheWarmingRunner {
  /**
   * A request completed with this prompt size.
   *
   * This is the only moment a window starts, so it is the only moment there is
   * anything to schedule against.
   */
  noteRequest(promptTokens: number, sent: SentRequest): void;
  /** The run ended; the session is now waiting on a person. */
  noteSettled(): void;
  /** Nothing more will be sent. */
  stop(): void;
  /** What is scheduled, for a surface that has to explain itself. */
  status(): { readonly mode: CacheWarmingMode; readonly nextRefreshAt?: number; readonly stopReason?: string };
}

export function createCacheWarmingRunner(options: CacheWarmingOptions): CacheWarmingRunner {
  const mode = resolveCacheWarmingMode(options.mode);
  const now = options.now ?? Date.now;

  let timer: NodeJS.Timeout | undefined;
  let controller: AbortController | undefined;
  let generation = 0;
  let stopped = false;
  let stopReason: string | undefined;
  /**
   * When the current phase began.
   *
   * Reset when the run settles, because the two phases are bounded differently:
   * a run may work for an hour, while a session waiting on a person is given
   * half of that. Measuring both from the first request would cut an idle
   * session off at the run's limit instead of its own.
   */
  let phaseStartedAt: number | undefined;
  let nextRefreshAt: number | undefined;
  let phase: "streaming" | "idle" = "streaming";
  let latestTokens = 0;
  /**
   * The request as it last went out.
   *
   * A refresh replays this rather than building anything: only these bytes carry
   * the prefix the provider cached.
   */
  let lastSent: SentRequest | undefined;

  const clear = (): void => {
    generation += 1;
    // The guard is not redundant here: the body also drops the reference and
    // aborts the in-flight request, so the timer is only part of it.
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    nextRefreshAt = undefined;
    controller?.abort();
    controller = undefined;
  };

  /** The window this model's prefix is kept for, when it says. */
  const ttlMs = (): number | undefined => {
    const seconds = options.promptCache?.short;
    return seconds === undefined ? undefined : seconds * 1000;
  };

  const ageLimit = (): number =>
    phase === "idle" ? MAX_IDLE_AGE_MS : MAX_STREAMING_AGE_MS;

  const fire = async (expectedGeneration: number, deadline: number): Promise<void> => {
    if (stopped || generation !== expectedGeneration) return;
    timer = undefined;
    nextRefreshAt = undefined;
    if (options.isCurrent?.() === false) { clear(); return; }
    const started = phaseStartedAt;
    // The session outlived its welcome: a run left open, or a person who walked
    // away. Both are reasons to stop spending rather than to keep refreshing.
    if (started === undefined || now() - started > ageLimit() || now() > deadline) {
      clear();
      return;
    }

    const decision = evaluateCacheWarming({
      ...(options.cost ? { cost: options.cost } : {}),
      promptTokens: latestTokens,
      phase,
    });
    options.onDecision?.(decision);
    if (stopped || generation !== expectedGeneration) return;
    if (options.isCurrent?.() === false) { clear(); return; }
    if (decision.action !== "warm") {
      // Declined on economics. Nothing else will change that for this prefix, so
      // there is no point staying armed.
      clear();
      return;
    }

    const sent = lastSent;
    if (sent === undefined) {
      clear();
      return;
    }

    controller = new AbortController();
    try {
      const usage = await options.refresh(sent, controller.signal);
      if (stopped || generation !== expectedGeneration) return;
      if (options.isCurrent?.() === false) { clear(); return; }
      if (usage) options.onUsage?.(usage);
    } catch (error) {
      if (error instanceof ModelAdmissionError) {
        stopReason = error.message; stopped = true; clear();
        options.onDecision?.(decision, stopReason);
        return;
      }
      // A refresh that failed is a refresh that did not happen. It is not worth
      // reporting: nothing the user did caused it, and nothing they can do
      // would fix it.
    }
    // A completion from an old prefix or phase must not replace a newer timer
    // or restart a stopped session, even if the transport ignored cancellation.
    if (!stopped && generation === expectedGeneration) schedule();
  };

  const schedule = (): void => {
    if (stopped || mode === "off" || lastSent === undefined) return;
    const ttl = ttlMs();
    if (ttl === undefined) return;
    const delay = cacheWarmingDelayMs(ttl);
    if (delay === undefined) return;
    const started = phaseStartedAt;
    if (started !== undefined && now() + delay - started > ageLimit()) return;

    if (timer !== undefined) clearTimeout(timer);
    nextRefreshAt = now() + delay;
    // Keep half the pre-expiry margin for dispatch after a delayed timer fires.
    const deadline = nextRefreshAt + Math.floor((ttl - delay) / 2);
    const expectedGeneration = generation;
    timer = setTimeout(() => {
      void fire(expectedGeneration, deadline);
    }, delay);
    // A pending refresh must not be the reason the process stays alive: the
    // session it belongs to is what holds it open.
    timer.unref?.();
  };

  return {
    noteRequest(promptTokens: number, sent: SentRequest): void {
      if (stopped || mode === "off") return;
      clear();
      if (!Number.isFinite(promptTokens) || promptTokens <= 0 || options.canRefresh?.(sent) === false) {
        lastSent = undefined;
        return;
      }
      latestTokens = Math.max(0, Math.floor(promptTokens));
      lastSent = sent;
      if (phase === "idle") phaseStartedAt = now();
      phaseStartedAt ??= now();
      phase = "streaming";
      schedule();
    },

    noteSettled(): void {
      if (stopped || mode === "off") return;
      // Only the mode that opted into waiting keeps going. The default stops
      // here, because refreshing for a person who may not return is a bet this
      // does not make on their behalf.
      if (mode !== "idle") {
        stopped = true;
        clear();
        return;
      }
      clear();
      phase = "idle";
      // The waiting phase starts its own clock, so a long run does not spend the
      // idle budget before the user has stopped working.
      phaseStartedAt = now();
      schedule();
    },

    stop(): void {
      stopped = true;
      clear();
    },

    status(): { readonly mode: CacheWarmingMode; readonly nextRefreshAt?: number; readonly stopReason?: string } {
      return { mode, ...(nextRefreshAt !== undefined ? { nextRefreshAt } : {}), ...(stopReason ? { stopReason } : {}) };
    },
  };
}
