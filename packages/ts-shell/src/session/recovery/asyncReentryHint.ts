import type { Session } from "../schema/sessionRecord.js";
import type { SessionSummary } from "../store/catalog/model.js";
import type { SessionReentrySummary } from "../presentation/sessionReentrySurface.js";
import type { RecoveryTrustBoundaryBlock } from "./recoveryTrustBoundary.js";
import type { SessionResumeEligibility } from "./sessionResumeEligibility.js";
import {
  projectSortedSessionReentrySummaries,
  selectRecoveryTrustBoundaryBlock,
  selectSuggestedRecoverySessionId,
} from "./sessionRecoverySelection.js";

export interface AsyncReentryHint {
  readonly candidate?: Session;
  readonly summary?: SessionReentrySummary;
  readonly blocked?: RecoveryTrustBoundaryBlock;
}

export interface SelectAsyncReentryHintInput {
  readonly summaries: readonly SessionSummary[];
  readonly preferredProjectRoot: string;
  readonly signal?: AbortSignal;
  readonly loadSession: (sessionId: string) => Session | undefined;
  readonly describe: (sessionId: string) => SessionReentrySummary;
  readonly evaluate: (session: Session) => SessionResumeEligibility;
}

function isRecoverable(summary: SessionReentrySummary): boolean {
  return (
    (summary.status === "interrupted" || summary.status === "error") &&
    summary.recoverable
  );
}

function orderByRecency(
  summaries: readonly SessionReentrySummary[],
): SessionReentrySummary[] {
  return [...summaries].sort((left, right) => {
    const updated = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    return updated || left.id.localeCompare(right.id);
  });
}

/**
 * Resolve a startup hint from a completed, deduplicated catalog scan.
 *
 * The scan is intentionally outside the first frame. This owner only projects
 * the already discovered summaries; it does not start a second listing or
 * convert an incomplete scan into an absence proof.
 */
export async function selectAsyncReentryHint(
  input: SelectAsyncReentryHintInput,
): Promise<AsyncReentryHint | null> {
  const preferredProjectRoot = input.preferredProjectRoot.trim();
  const sessions = new Map<string, Session>();
  const summaries: SessionReentrySummary[] = [];
  let visited = 0;

  for (const summary of input.summaries) {
    input.signal?.throwIfAborted();
    if (summary.reentry !== "available") continue;
    const session = input.loadSession(summary.id);
    if (!session) continue;
    sessions.set(session.id, session);
    try {
      summaries.push(input.describe(summary.id));
    } catch {
      continue;
    }
    visited++;
    if (visited % 32 === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  input.signal?.throwIfAborted();
  const ordered = orderByRecency(summaries);
  const candidateId = preferredProjectRoot
    ? selectSuggestedRecoverySessionId({
        summaries: ordered,
        preferredProjectRoot,
      })
    : ordered.find(isRecoverable)?.id;

  if (candidateId) {
    const candidate = sessions.get(candidateId) ?? input.loadSession(candidateId);
    const summary = summaries.find((entry) => entry.id === candidateId);
    if (candidate && summary) return { candidate, summary };
  }

  const fallback = projectSortedSessionReentrySummaries({
    summaries: ordered,
    preferredProjectRoot,
    limit: 20,
  }).find(
    (summary) =>
      (summary.hasConversation || summary.hasReportHistory) &&
      (summary.status !== "interrupted" && summary.status !== "error"
        ? true
        : summary.recoverable),
  );
  if (fallback) {
    const candidate = sessions.get(fallback.id) ?? input.loadSession(fallback.id);
    if (candidate) return { candidate, summary: fallback };
  }

  const evaluate = (session: Session): SessionResumeEligibility => {
    try {
      return input.evaluate(session);
    } catch {
      return {
        recoverable: false,
        disposition: "not-resumable",
        autoResumeReady: false,
        detail: "Recovery eligibility could not be evaluated.",
      };
    }
  };
  const blocked = selectRecoveryTrustBoundaryBlock({
    sessions: [...sessions.values()],
    preferredProjectRoot,
    evaluate,
  });
  return blocked ? { blocked } : null;
}
