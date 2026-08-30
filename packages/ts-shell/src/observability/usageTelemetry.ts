export interface SessionUsageTelemetry {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  turnsCount: number;
  toolCallsCount: number;
  model: string;
  lastUpdated: number;
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
  },
): void {
  const existing = sessionTelemetries.get(sessionId) ?? {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    turnsCount: 0,
    toolCallsCount: 0,
    model: usage.model || "default",
    lastUpdated: Date.now(),
  };

  const pTokens = usage.promptTokens ?? 0;
  const cTokens = usage.completionTokens ?? 0;
  const tTokens = usage.totalTokens ?? pTokens + cTokens;

  existing.promptTokens += pTokens;
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
      turnsCount: 0,
      toolCallsCount: 0,
      model: "default",
      lastUpdated: Date.now(),
    }
  );
}

export function resetSessionUsage(sessionId: string): void {
  sessionTelemetries.delete(sessionId);
}
