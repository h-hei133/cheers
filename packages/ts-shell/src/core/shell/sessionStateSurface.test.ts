import { describe, expect, it, vi } from "vitest";
import type {
  SessionContinuitySnapshot,
  SessionReentrySummary,
} from "../../session/SessionManager.js";
import {
  formatCurrentSessionLines,
  formatSessionListLine,
  formatStoppedContinueGuidanceLines,
  formatSwitchedSessionLines,
} from "./sessionStateSurface.js";

function baseSummary(
  overrides: Partial<SessionReentrySummary> = {},
): SessionReentrySummary {
  return {
    id: "sess_surface",
    title: "Surface Session",
    status: "error",
    projectRoot: "/tmp/project",
    createdAt: "2026-05-08T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:30.000Z",
    pendingPrompt: undefined,
    runPhase: "idle",
    lastError: undefined,
    durableStatus: "stopped",
    terminalReason: "stopped_error",
    terminalClassification: "stopped",
    lastUserMessage: "repair docs/failed-edit.md",
    lastAssistantMessage: "Patch failed because source text was missing.",
    recoverable: false,
    resumeDisposition: "not-resumable",
    autoResumeReady: false,
    resumeDetail: "Durable status is stopped",
    blockedReason: "continuation-evidence-missing",
    blockedDetail: "durable status is stopped and cannot continue",
    ...overrides,
  };
}

function baseContinuitySnapshot(
  overrides: Partial<SessionContinuitySnapshot> = {},
): SessionContinuitySnapshot {
  return {
    sessionId: "sess_surface",
    projectRoot: "/tmp/project",
    lastTaskKind: "edit-file",
    recentChangedFiles: [],
    recentTargetFiles: ["docs/failed-edit.md"],
    recentVerifiedFiles: [],
    recentFailedFiles: [
      {
        path: "docs/failed-edit.md",
        reason: "Source text was not found.",
      },
    ],
    lastContinuationEvidence: [],
    unresolvedItems: [],
    lastTerminalClassification: "stopped",
    lastFailure: "Source text was not found.",
    lastVerificationStatus: "blocked",
    lastVerificationReason: "Source text was not found.",
    lastVerificationBlockerKind: "patch-from-not-found",
    lastVerificationNextAction:
      "Re-read docs/failed-edit.md, then rerun with exact current text.",
    lastRepairNotes: [],
    lastTaskSatisfactionReasons: [],
    ...overrides,
  };
}

describe("sessionStateSurface", () => {
  it("keeps stopped durable state visible in current-session lines", () => {
    const lines = formatCurrentSessionLines(
      baseSummary({ runPhase: "turn-active", pendingPrompt: "resume me" }),
    ).join("\n");

    expect(lines).toContain("- Status: error");
    expect(lines).toContain("- Durable status: stopped");
    expect(lines).toContain("- Run phase: turn-active");
    expect(lines).toContain("- Last terminal: stopped (stopped_error)");
    expect(lines).toContain("- Pending prompt: resume me");
    expect(lines).toContain(
      "- Recoverability: blocked (continuation-evidence-missing)",
    );
  });

  it("keeps list and switch summaries compact but state-truthful", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T00:01:00.000Z"));
    try {
      const summary = baseSummary({ runPhase: "prompt-persisted" });

      expect(
        formatSessionListLine({
          summary,
          activeSessionId: "sess_surface",
        }),
      ).toContain(
        "* sess_surface  [error] [blocked]  Surface Session  @project  updated=30s ago durable=stopped phase=prompt-persisted terminal=stopped",
      );

      expect(formatSwitchedSessionLines(summary)[0]).toBe(
        "Session summary: Surface Session [error; durable=stopped; phase=prompt-persisted]",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders bare stopped continue guidance without success-like wording", () => {
    const lines = formatStoppedContinueGuidanceLines({
      printMode: true,
      sessionId: "sess_surface",
      summary: baseSummary(),
      snapshot: baseContinuitySnapshot(),
    }).join("\n");

    expect(lines).toContain("- Outcome: stopped");
    expect(lines).toContain("- Status: error");
    expect(lines).toContain("- DurableStatus: stopped");
    expect(lines).toContain("- TerminalState: stopped");
    expect(lines).toContain("- BlockerKind: patch-from-not-found");
    expect(lines).toContain("- Failed files: docs/failed-edit.md");
    expect(lines).toContain(
      "- DoNext: Re-read docs/failed-edit.md, then rerun with exact current text.",
    );
    expect(lines.toLowerCase()).not.toContain("outcome: success");
  });
});
