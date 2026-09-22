import { describe, expect, it } from "vitest";

import {
  projectRecentProjectContexts,
} from "./recovery/projectContextSummary.js";
import {
  projectSortedSessionReentrySummaries,
  selectRecoveryTrustBoundaryBlock,
  selectSuggestedRecoverySessionId,
  selectSuggestedRecoverySessionIdFromSessions,
} from "./recovery/sessionRecoverySelection.js";
import type {
  RecoveryTrustBoundaryBlock,
  Session,
  SessionReentrySummary,
} from "./SessionManager.js";

describe("sessionRecoverySelection", () => {
  it("projects recent project contexts without creating success state", () => {
    expect(projectRecentProjectContexts({
      summaries: [
        summary({
          id: "old",
          projectRoot: "/repo/a",
          updatedAt: "2026-01-01T00:00:00.000Z",
          status: "completed",
          recoverable: false,
          terminalClassification: "success",
        }),
        summary({
          id: "new",
          projectRoot: "/repo/a",
          updatedAt: "2026-01-02T00:00:00.000Z",
          status: "interrupted",
          recoverable: true,
          terminalClassification: "stopped",
          title: "Recover me",
        }),
      ],
    })).toEqual([
      {
        projectRoot: "/repo/a",
        lastUpdatedAt: "2026-01-02T00:00:00.000Z",
        lastSessionId: "new",
        sessionCount: 2,
        recoverableCount: 1,
        lastSessionTitle: "Recover me",
      },
    ]);
  });

  it("sorts reentry summaries by resumability, preferred root, and recency", () => {
    const sorted = projectSortedSessionReentrySummaries({
      preferredProjectRoot: "/repo/b",
      summaries: [
        summary({ id: "success", terminalClassification: "success" }),
        summary({
          id: "preferred",
          projectRoot: "/repo/b",
          resumeDisposition: "fully-resumable",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        summary({
          id: "other",
          projectRoot: "/repo/a",
          resumeDisposition: "partially-resumable",
          updatedAt: "2026-01-03T00:00:00.000Z",
        }),
      ],
    });

    expect(sorted.map((entry) => entry.id)).toEqual([
      "other",
      "preferred",
      "success",
    ]);
  });

  it("selects a suggested recovery session without treating completed sessions as recoverable", () => {
    expect(selectSuggestedRecoverySessionId({
      summaries: [
        summary({ id: "completed", status: "completed", recoverable: true }),
        summary({ id: "recoverable", status: "error", recoverable: true }),
      ],
    })).toBe("recoverable");
  });

  it("selects unscoped recovery from sessions without requiring full summary projection", () => {
    expect(selectSuggestedRecoverySessionIdFromSessions({
      sessions: [
        session({ id: "completed", projectRoot: "/repo/a", status: "completed" }),
        session({ id: "recoverable", projectRoot: "/repo/a", status: "error" }),
      ],
      evaluate: (candidate) => ({
        recoverable: candidate.id === "recoverable",
      }),
      projectPreferredSummaries: () => {
        throw new Error("unexpected preferred summary projection");
      },
    })).toBe("recoverable");
  });

  it("keeps trust-boundary blocks project-preferred and explicit", () => {
    const blocked: RecoveryTrustBoundaryBlock = {
      sessionId: "blocked",
      reason: "session-corrupt",
      detail: "state snapshot is not compatible",
      recoveryHint: "Start a fresh session.",
    };
    const block = selectRecoveryTrustBoundaryBlock({
      preferredProjectRoot: "/repo/b",
      sessions: [
        session({ id: "other", projectRoot: "/repo/a", status: "error" }),
        session({ id: "blocked", projectRoot: "/repo/b", status: "error" }),
      ],
      evaluate: (candidate) => ({
        recoverable: candidate.id !== "blocked",
        ...(candidate.id === "blocked" ? { block: blocked } : {}),
      }),
    });

    expect(block).toBe(blocked);
  });
});

function summary(
  input: Partial<SessionReentrySummary> & { id: string },
): SessionReentrySummary {
  return {
    id: input.id,
    status: input.status ?? "interrupted",
    projectRoot: input.projectRoot ?? "/repo/default",
    createdAt: input.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-01-01T00:00:00.000Z",
    durableStatus: input.durableStatus,
    terminalReason: input.terminalReason,
    terminalClassification: input.terminalClassification ?? "stopped",
    recoverable: input.recoverable ?? true,
    resumeDisposition: input.resumeDisposition ?? "partially-resumable",
    autoResumeReady: input.autoResumeReady ?? false,
    resumeDetail: input.resumeDetail,
    title: input.title,
  };
}

function session(input: {
  readonly id: string;
  readonly projectRoot: string;
  readonly status: Session["status"];
}): Session {
  return {
    id: input.id,
    projectRoot: input.projectRoot,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: input.status,
    turns: [],
  };
}
