import type { SessionReentrySummary } from "../presentation/sessionReentrySurface.js";

export interface ProjectContextSummary {
  readonly projectRoot: string;
  readonly lastUpdatedAt: string;
  readonly lastSessionId: string;
  readonly sessionCount: number;
  readonly recoverableCount: number;
  readonly lastSessionTitle?: string;
}

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
        shouldReplaceLast ? summary.title : current.lastSessionTitle,
    });
  }

  const ordered = Array.from(aggregate.values()).sort(
    (left, right) =>
      new Date(right.lastUpdatedAt).getTime() -
      new Date(left.lastUpdatedAt).getTime(),
  );
  return ordered.slice(0, input.limit ?? 8);
}
