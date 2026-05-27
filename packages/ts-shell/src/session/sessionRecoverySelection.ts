import type {
  ProjectContextSummary,
  RecoveryTrustBoundaryBlock,
  Session,
  SessionReentrySummary,
} from "./SessionManager.js";
import { scoreSessionReentrySummary } from "./sessionSummaryProjection.js";

export function projectRecentProjectContexts(input: {
  readonly summaries: readonly SessionReentrySummary[];
  readonly limit?: number;
}): ProjectContextSummary[] {
  const aggregate = new Map<string, ProjectContextSummary>();
  for (const summary of input.summaries) {
    const reentryRecoverable =
      (summary.status === "interrupted" || summary.status === "error") &&
      summary.recoverable;
    const current = aggregate.get(summary.projectRoot);
    if (!current) {
      aggregate.set(summary.projectRoot, {
        projectRoot: summary.projectRoot,
        lastUpdatedAt: summary.updatedAt,
        lastSessionId: summary.id,
        sessionCount: 1,
        recoverableCount: reentryRecoverable ? 1 : 0,
        lastSessionTitle: summary.title,
      });
      continue;
    }

    const shouldReplaceLast =
      new Date(summary.updatedAt).getTime() >
      new Date(current.lastUpdatedAt).getTime();
    aggregate.set(summary.projectRoot, {
      projectRoot: current.projectRoot,
      lastUpdatedAt: shouldReplaceLast ? summary.updatedAt : current.lastUpdatedAt,
      lastSessionId: shouldReplaceLast ? summary.id : current.lastSessionId,
      sessionCount: current.sessionCount + 1,
      recoverableCount: current.recoverableCount + (reentryRecoverable ? 1 : 0),
      lastSessionTitle:
        shouldReplaceLast && summary.title ? summary.title : current.lastSessionTitle,
    });
  }

  const ordered = Array.from(aggregate.values()).sort(
    (left, right) =>
      new Date(right.lastUpdatedAt).getTime() -
      new Date(left.lastUpdatedAt).getTime(),
  );
  return ordered.slice(0, input.limit ?? 8);
}

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
        summary.recoverable &&
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
