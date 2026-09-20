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
}

/** Per-million-token rates used for the session cost estimate. */
export const USAGE_RATES = { promptPerMTok: 0.14, completionPerMTok: 0.28 } as const;

/** Estimated spend for a session's recorded usage, in US dollars. */
export function estimateUsageCost(telemetry: SessionUsageTelemetry): number {
  return (
    (telemetry.promptTokens / 1_000_000) * USAGE_RATES.promptPerMTok +
    (telemetry.completionTokens / 1_000_000) * USAGE_RATES.completionPerMTok
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
