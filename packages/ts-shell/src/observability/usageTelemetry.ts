import type { ModelCostRates } from "../core/models/catalog.js";

export type { ModelCostRates };

export interface SessionUsageTelemetry {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /**
   * Prompt tokens of the most recent request. This, not the cumulative
   * `promptTokens`, is the session's live context footprint: every request
   * resends the whole conversation, so the sum across turns counts the same
   * context many times over.
   */
  lastPromptTokens: number;
  /**
   * How many messages that request carried.
   *
   * The measured count only covers what was sent. Anything the conversation
   * gained afterwards is not in the provider's number, so the two have to be
   * added together before either can answer whether the next request fits.
   */
  lastPromptMessageCount: number;
  turnsCount: number;
  toolCallsCount: number;
  model: string;
  lastUpdated: number;
  /**
   * Prompt tokens the provider served from its cache, and tokens it charged for
   * writing into one. Reported by the provider, not estimated here: a cache hit
   * is the difference between paying for a prompt and paying a fraction of it,
   * and a session that cannot see it cannot tell why its cost moved.
   */
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Per-million-token rates used for the session cost estimate. */
export const USAGE_RATES = { promptPerMTok: 0.14, completionPerMTok: 0.28 } as const;

/**
 * Estimated spend for a session's recorded usage, in US dollars.
 *
 * `rates` comes from the model catalog when the model publishes its prices. The
 * constant below is the fallback for the models that do not, and callers must say
 * which one they used: an estimate that does not name its rate is indistinguishable
 * from a measured bill.
 */
export function estimateUsageCost(
  telemetry: SessionUsageTelemetry,
  rates: ModelCostRates = USAGE_RATES,
): number {
  return (
    (telemetry.promptTokens / 1_000_000) * rates.promptPerMTok +
    (telemetry.completionTokens / 1_000_000) * rates.completionPerMTok +
    (telemetry.cacheReadTokens / 1_000_000) * (rates.cacheReadPerMTok ?? 0) +
    (telemetry.cacheWriteTokens / 1_000_000) * (rates.cacheWritePerMTok ?? 0)
  );
}



const sessionTelemetries: Map<string, SessionUsageTelemetry> = new Map();

export function recordSessionUsage(
  sessionId: string,
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    toolCallsCount?: number;
    model?: string;
    /** How many messages the request carried, so trailing ones can be counted. */
    promptMessageCount?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  },
): void {
  const existing = sessionTelemetries.get(sessionId) ?? {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    lastPromptTokens: 0,
    lastPromptMessageCount: 0,
    turnsCount: 0,
    toolCallsCount: 0,
    model: usage.model || "default",
    lastUpdated: Date.now(),
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  const pTokens = usage.promptTokens ?? 0;
  const cTokens = usage.completionTokens ?? 0;
  const tTokens = usage.totalTokens ?? pTokens + cTokens;

  existing.promptTokens += pTokens;
  if (pTokens > 0) {
    existing.lastPromptTokens = pTokens;
    existing.lastPromptMessageCount = usage.promptMessageCount ?? 0;
  }
  existing.completionTokens += cTokens;
  existing.totalTokens += tTokens;
  existing.turnsCount += 1;
  existing.toolCallsCount += usage.toolCallsCount ?? 0;
  existing.cacheReadTokens += usage.cacheReadTokens ?? 0;
  existing.cacheWriteTokens += usage.cacheWriteTokens ?? 0;
  if (usage.model) {
    existing.model = usage.model;
  }
  existing.lastUpdated = Date.now();

  sessionTelemetries.set(sessionId, existing);
}

export function getSessionUsage(sessionId: string): SessionUsageTelemetry {
  return (
    sessionTelemetries.get(sessionId) ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      lastPromptTokens: 0,
      lastPromptMessageCount: 0,
      turnsCount: 0,
      toolCallsCount: 0,
      model: "default",
      lastUpdated: Date.now(),
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }
  );
}

/**
 * Forget the live context footprint without touching the totals. After a
 * compaction the last request's prompt size describes a context that no longer
 * exists, so the gauge goes absent until the next response reports a real one.
 */
export function markContextUnknown(sessionId: string): void {
  const existing = sessionTelemetries.get(sessionId);
  if (existing) {
    existing.lastPromptTokens = 0;
    existing.lastPromptMessageCount = 0;
  }
}

export function resetSessionUsage(sessionId: string): void {
  sessionTelemetries.delete(sessionId);
}
