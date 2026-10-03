import type { SessionReentrySummary } from "../presentation/sessionReentrySurface.js";
import { scoreSessionReentrySummary } from "../presentation/sessionReentrySurface.js";
import type { Session } from "../schema/sessionRecord.js";
import type { RecoveryTrustBoundaryBlock } from "./recoveryTrustBoundary.js";

export function projectSortedSessionReentrySummaries(input: {
  readonly summaries: readonly SessionReentrySummary[];
  readonly preferredProjectRoot?: string;
  readonly limit?: number;
}): SessionReentrySummary[] {
  const preferredProjectRoot = input.preferredProjectRoot?.trim();
  const scored = input.summaries.map((summary) => ({
    summary,
    score: scoreSessionReentrySummary({ summary, preferredProjectRoot }),
  }));
  scored.sort((left, right) => right.score - left.score);
  const sorted = scored.map((item) => item.summary);

  if (!input.limit || input.limit <= 0) {
    return sorted;
  }

  return sorted.slice(0, input.limit);
}

export function selectSuggestedRecoverySessionId(input: {
  readonly summaries: readonly SessionReentrySummary[];
  readonly preferredProjectRoot?: string;
}): string | null {
  const preferredProjectRoot = input.preferredProjectRoot?.trim();
  if (!preferredProjectRoot) {
    return input.summaries.find(isRecoverableReentrySummary)?.id ?? null;
  }

  return (
    projectSortedSessionReentrySummaries({
      summaries: input.summaries,
      preferredProjectRoot,
    }).find(
      (summary) =>
        isRecoverableReentrySummary(summary) &&
        summary.projectRoot.trim() === preferredProjectRoot,
    )?.id ?? null
  );
}

export function selectSuggestedRecoverySessionIdFromSessions(input: {
  readonly sessions: readonly Session[];
  readonly preferredProjectRoot?: string;
  readonly evaluate: (session: Session) => { readonly recoverable: boolean };
  readonly projectPreferredSummaries: (
    preferredProjectRoot: string,
  ) => readonly SessionReentrySummary[];
}): string | null {
  const preferredProjectRoot = input.preferredProjectRoot?.trim();
  if (!preferredProjectRoot) {
    return (
      input.sessions.find((session) => {
        if (session.status !== "interrupted" && session.status !== "error") {
          return false;
        }
        return input.evaluate(session).recoverable;
      })?.id ?? null
    );
  }

  return selectSuggestedRecoverySessionId({
    summaries: input.projectPreferredSummaries(preferredProjectRoot),
    preferredProjectRoot,
  });
}

export function orderSessionsForRecoveryTrustBoundary(input: {
  readonly sessions: readonly Session[];
  readonly preferredProjectRoot?: string;
}): Session[] {
  const preferredProjectRoot = input.preferredProjectRoot?.trim();
  if (!preferredProjectRoot) {
    return [...input.sessions];
  }

  return [
    ...input.sessions.filter(
      (session) => session.projectRoot.trim() === preferredProjectRoot,
    ),
    ...input.sessions.filter(
      (session) => session.projectRoot.trim() !== preferredProjectRoot,
    ),
  ];
}

export function selectRecoveryTrustBoundaryBlock(input: {
  readonly sessions: readonly Session[];
  readonly preferredProjectRoot?: string;
  readonly evaluate: (session: Session) => {
    readonly recoverable: boolean;
    readonly block?: RecoveryTrustBoundaryBlock;
  };
}): RecoveryTrustBoundaryBlock | null {
  for (const session of orderSessionsForRecoveryTrustBoundary(input)) {
    if (session.status !== "interrupted" && session.status !== "error") {
      continue;
    }

    const trustBoundary = input.evaluate(session);
    if (!trustBoundary.recoverable && trustBoundary.block) {
      return trustBoundary.block;
    }
  }

  return null;
}

function isRecoverableReentrySummary(summary: SessionReentrySummary): boolean {
  return (
    (summary.status === "interrupted" || summary.status === "error") &&
    summary.recoverable
  );
}
