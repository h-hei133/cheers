import type { ProviderUsage } from "./completion.js";
import {
  cacheWarmingDelayMs,
  evaluateCacheWarming,
  resolveCacheWarmingMode,
  type CacheWarmingDecision,
  type CacheWarmingMode,
} from "../core/models/cacheEconomics.js";
import { captureCostSchedule, type ModelCostSchedule } from '../core/models/pricing.js';
import type { SentRequest } from "../provider/request/sentRequest.js";
import { ModelAdmissionError } from '../core/agent/request/model.js';
import { InputLimitError } from '../provider/request/input.js';
import { freezeDeep } from '../core/values/freeze.js';

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
  readonly cost?: ModelCostSchedule;
  /**
   * Send the refresh.
   *
   * Handed the request that was actually sent, because a refresh is only a
   * refresh if the bytes match: the cache is keyed on the request's own prefix,
   * so anything rebuilt from the session's history arrives as a different one.
   * Supplied rather than built here because sending is a model call, and this
   * module has no business knowing how to reach a provider.
   */
  readonly refresh: (sent: SentRequest, signal: AbortSignal, deadline?: number) => Promise<ProviderUsage | void>;
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
   * The captured send time and actual protocol window determine its expiry;
   * notification time cannot extend an already aging prefix.
   */
  noteRequest(promptTokens: number, sent: SentRequest): void;
  /** The run ended; the session is now waiting on a person. */
  noteSettled(): void;
  /** Nothing more will be sent. */
  stop(): void;
  /** Retire captured provider input and wait for owned refresh work to settle. */
  reset(): Promise<'reset' | 'unchanged' | 'unknown'>;
  /** What is scheduled, for a surface that has to explain itself. */
  status(): { readonly mode: CacheWarmingMode; readonly nextRefreshAt?: number; readonly stopReason?: string };
}

export function createCacheWarmingRunner(options: CacheWarmingOptions): CacheWarmingRunner {
  const cost = captureCostSchedule(options.cost ?? null) ?? undefined;
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
  let refreshedAt: number | undefined;
  /**
   * The request as it last went out.
   *
   * A refresh replays this rather than building anything: only these bytes carry
   * the prefix the provider cached.
   */
  let lastSent: SentRequest | undefined;
  const pendingRefreshes = new Set<Promise<ProviderUsage | void>>();

  const clear = (): number => {
    const cleared = ++generation;
    // The guard is not redundant here: the body also drops the reference and
    // aborts the in-flight request, so the timer is only part of it.
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    nextRefreshAt = undefined;
    const previousController = controller;
    controller = undefined;
    previousController?.abort();
    return cleared;
  };

  /** Only the accepted request can say which window its protocol selected. */
  const ttlMs = (): number | undefined => {
    const cache = lastSent?.cache;
    return cache?.retention === 'short' || cache?.retention === 'long' ? cache.ttlMs : undefined;
  };

  const current = (expectedGeneration: number): boolean => {
    if (stopped || generation !== expectedGeneration) return false;
    const admitted = options.isCurrent?.() !== false;
    if (stopped || generation !== expectedGeneration) return false;
    if (!admitted) clear();
    return admitted;
  };

  const ageLimit = (): number =>
    phase === "idle" ? MAX_IDLE_AGE_MS : MAX_STREAMING_AGE_MS;

  const fire = async (expectedGeneration: number, deadline: number): Promise<void> => {
    if (stopped || generation !== expectedGeneration) return;
    timer = undefined;
    nextRefreshAt = undefined;
    if (!current(expectedGeneration)) return;
    const started = phaseStartedAt;
    // The session outlived its welcome: a run left open, or a person who walked
    // away. Both are reasons to stop spending rather than to keep refreshing.
    if (started === undefined || now() - started > ageLimit() || now() > deadline) {
      clear();
      return;
    }

    const decision = evaluateCacheWarming({
      ...(cost ? { cost } : {}),
      promptTokens: latestTokens,
      phase,
    });
    options.onDecision?.(decision);
    if (!current(expectedGeneration)) return;
    if (now() > deadline || now() - started > ageLimit()) { clear(); return; }
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

    const refreshController = new AbortController();
    controller = refreshController;
    const dispatchedAt = now();
    let refreshing: Promise<ProviderUsage | void> | undefined;
    try {
      refreshing = options.refresh(sent, refreshController.signal, deadline);
      pendingRefreshes.add(refreshing);
      const usage = await refreshing;
      if (!current(expectedGeneration)) return;
      if (!usage) { refreshedAt = undefined; return; }
      refreshedAt = dispatchedAt;
      options.onUsage?.(usage);
    } catch (error) {
      if (stopped || generation !== expectedGeneration) return;
      if (error instanceof ModelAdmissionError || error instanceof InputLimitError) {
        stopReason = error.message; stopped = true; clear();
        options.onDecision?.(decision, stopReason);
        return;
      }
      // A failed send establishes no new cache window. A later foreground
      // request may provide a fresh prefix, but this timer cannot invent one.
      if (generation === expectedGeneration) refreshedAt = undefined;
      return;
    } finally {
      if (refreshing) pendingRefreshes.delete(refreshing);
      if (controller === refreshController) controller = undefined;
    }
    // A completion from an old prefix or phase must not replace a newer timer
    // or restart a stopped session, even if the transport ignored cancellation.
    if (!stopped && generation === expectedGeneration) schedule();
  };

  const schedule = (): void => {
    if (stopped || mode === "off" || lastSent === undefined) return;
    const ttl = ttlMs();
    if (ttl === undefined || refreshedAt === undefined) return;
    const delay = cacheWarmingDelayMs(ttl);
    if (delay === undefined) return;
    const currentTime = now();
    const due = refreshedAt + delay;
    // Keep half the pre-expiry margin for dispatch after a delayed timer fires.
    const started = phaseStartedAt;
    const deadline = Math.min(due + Math.floor((ttl - delay) / 2), started === undefined ? Infinity : started + ageLimit());
    if (!Number.isSafeInteger(deadline) || currentTime > deadline) return;
    if (started !== undefined && Math.max(currentTime, due) - started > ageLimit()) return;

    if (timer !== undefined) clearTimeout(timer);
    nextRefreshAt = Math.max(currentTime, due);
    const expectedGeneration = generation;
    timer = setTimeout(() => {
      void fire(expectedGeneration, deadline);
    }, Math.max(0, due - currentTime));
    // A pending refresh must not be the reason the process stays alive: the
    // session it belongs to is what holds it open.
    timer.unref?.();
  };

  return {
    noteRequest(promptTokens: number, sent: SentRequest): void {
      if (stopped || mode === "off") return;
      const expectedGeneration = clear();
      if (stopped || generation !== expectedGeneration) return;
      lastSent = undefined; refreshedAt = undefined;
      if (!Number.isFinite(promptTokens) || promptTokens <= 0) return;
      const captured = freezeDeep(structuredClone(sent));
      if (options.canRefresh?.(captured) === false) return;
      if (!current(expectedGeneration)) return;
      latestTokens = Math.max(0, Math.floor(promptTokens));
      lastSent = captured;
      const currentTime = now();
      const preparedAt = Date.parse(captured.context?.capturedAt ?? '');
      const timestamp = captured.sentAt !== undefined && Number.isFinite(captured.sentAt) && captured.sentAt <= currentTime
        ? captured.sentAt : preparedAt;
      // A future or malformed timestamp cannot manufacture a longer window.
      refreshedAt = Number.isFinite(timestamp) && timestamp <= currentTime ? timestamp : currentTime;
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
      if (phase === 'idle') return;
      // Cancellation cannot tell whether this in-flight send refreshed a cache.
      // A phase change retires it until a new foreground request is observed.
      if (controller !== undefined) refreshedAt = undefined;
      const expectedGeneration = clear();
      if (stopped || generation !== expectedGeneration) return;
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

    async reset() {
      const hadState = lastSent !== undefined || timer !== undefined || pendingRefreshes.size > 0;
      stopped = true; clear(); lastSent = undefined; refreshedAt = undefined;
      if (!hadState) return 'unchanged';
      let deadline: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          Promise.allSettled([...pendingRefreshes]).then(() => 'reset' as const),
          new Promise<'unknown'>(resolve => { deadline = setTimeout(() => resolve('unknown'), 3000); }),
        ]);
      } finally { if (deadline) clearTimeout(deadline); }
    },

    status(): { readonly mode: CacheWarmingMode; readonly nextRefreshAt?: number; readonly stopReason?: string } {
      return { mode, ...(nextRefreshAt !== undefined ? { nextRefreshAt } : {}), ...(stopReason ? { stopReason } : {}) };
    },
  };
}
