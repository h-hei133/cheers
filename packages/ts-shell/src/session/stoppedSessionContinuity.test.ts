import { describe, expect, it } from "vitest";
import type { CodingResultSummary } from "../orchestration/types.js";
import { deriveStoppedSessionContinuitySurface } from "./stoppedSessionContinuity.js";

describe("stopped session continuity", () => {
  it.each(["unknown", "unverified"] as const)(
    "keeps writer-started %s write effect actionable without success",
    (writeEffect) => {
      const result = makeCodingResult({
        failedFiles: [
          {
            path: "docs/uncertain-edit.md",
            reason: `writer stopped with ${writeEffect} effect`,
          },
        ],
        unverifiedFiles: [
          {
            path: "docs/uncertain-edit.md",
            reason: "inspect before retrying",
          },
        ],
        verification: {
          status: "blocked",
          reason: `writer stopped with ${writeEffect} effect`,
          blockerKind: "unknown",
          nextAction:
            "Re-read docs/uncertain-edit.md before retrying the edit.",
        },
        evidence: [
          "apply-patch-workspace-write-result:writer-started-no-success",
          `apply-patch-workspace-write-result:write-effect:${writeEffect}`,
          "apply-patch-workspace-write-result:user-inspection-required",
        ],
        lastActionResultSeed: {
          actionKind: "edit-file",
          target: "docs/uncertain-edit.md",
          changedFiles: [],
          verifiedFiles: [],
          writerStarted: true,
          writeEffect,
          requiresUserInspection: true,
          verification: {
            status: "blocked",
            reason: `writer stopped with ${writeEffect} effect`,
            blockerKind: "unknown",
          },
        },
      });

      const surface = deriveStoppedSessionContinuitySurface(result);

      expect(surface?.kind).toBe(`writer-started-${writeEffect}`);
      expect(surface?.writeContinuity).toEqual({
        writerStarted: true,
        writeEffect,
        requiresUserInspection: true,
        target: "docs/uncertain-edit.md",
      });
      expect(surface?.failureHandoffDiagnostic).toContain(
        "Failure handoff: status=blocked",
      );
      expect(surface?.failureHandoffDiagnostic).toContain("writer-started=yes");
      expect(surface?.failureHandoffDiagnostic).toContain(
        `write-effect=${writeEffect}`,
      );
      expect(surface?.failureHandoffDiagnostic).not.toContain(
        "Success handoff",
      );
      expect(result.changedFiles).toEqual([]);
      expect(result.failedFiles).toEqual([
        {
          path: "docs/uncertain-edit.md",
          reason: `writer stopped with ${writeEffect} effect`,
        },
      ]);
    },
  );

  it("keeps approval denial separate from execution failure", () => {
    const result = makeCodingResult({
      failedFiles: [],
      verification: {
        status: "blocked",
        reason: "Approval denied by user for bash verification.",
        blockerKind: "approval-denied",
      },
      evidence: ["actionable-blocker-kind:approval-denied"],
      failureBoundary: "approval-denied",
      provenance: {
        toolExecutions: [
          {
            kind: "approval-denied",
            source: "approval-flow",
            legacySuccess: false,
            toolName: "bash",
            taskId: "task_approval_denied",
            failureBoundary: "approval-denied",
          },
        ],
      },
    });

    const surface = deriveStoppedSessionContinuitySurface(result);

    expect(surface?.kind).toBe("approval-denied");
    expect(surface?.actionableFailure?.blockerKind).toBe("approval-denied");
    expect(surface?.failureHandoffDiagnostic).toContain(
      "blocker=approval-denied",
    );
    expect(surface?.failureHandoffDiagnostic).not.toContain(
      "tool-execution-failed",
    );
    expect(result.changedFiles).toEqual([]);
    expect(result.failedFiles).toEqual([]);
  });

  it("keeps stale-read reason and re-read next action", () => {
    const reason =
      "stale-read: src/stale.ts changed since it was read for this edit.";
    const nextAction =
      "Re-read src/stale.ts, then rerun the edit against current content.";
    const result = makeCodingResult({
      failedFiles: [{ path: "src/stale.ts", reason }],
      unverifiedFiles: [{ path: "src/stale.ts", reason }],
      verification: {
        status: "blocked",
        reason,
        blockerKind: "unknown",
      },
      evidence: [
        "actionable-blocker-kind:stale-read",
        `actionable-blocker-next:${nextAction}`,
      ],
      failureBoundary: reason,
    });

    const surface = deriveStoppedSessionContinuitySurface(result);

    expect(surface?.kind).toBe("stale-read");
    expect(surface?.actionableFailure).toEqual({
      blockerKind: "stale-read",
      nextAction,
    });
    expect(surface?.failureHandoffDiagnostic).toBe(
      `Failure handoff: status=blocked; target=src/stale.ts; reason=${reason}; blocker=stale-read; next=${nextAction.replace(/[.]+$/, "")}.`,
    );
  });

  it("summarizes unsupported fenced replacement without raw block content", () => {
    const nextAction =
      "Provide exact old and new fenced blocks for one explicit target file.";
    const result = makeCodingResult({
      failedFiles: [
        {
          path: "src/app.ts",
          reason:
            "Fuzzy fenced replacement is outside the exact replacement lane.",
        },
      ],
      verification: {
        status: "blocked",
        reason:
          "Fuzzy fenced replacement is outside the exact replacement lane.",
        blockerKind: "unknown",
        nextAction,
      },
      evidence: [
        "fenced-edit-outcome:fenced-edit-unsupported-fuzzy",
        "fenced-edit-mutation:not-run",
        "fenced-edit-result:raw-content-excluded",
        "actionable-blocker-kind:unsupported-future-edit",
      ],
      continuation: {
        status: "failed-after-bounded-continuation",
        attempts: 1,
        evidence: [
          "fenced-edit-result:operation:fenced-replacement",
          "fenced-edit-result:state:stopped",
          "fenced-edit-outcome:fenced-edit-unsupported-fuzzy",
          "fenced-edit-result:raw-content-excluded",
        ],
      },
    });

    const surface = deriveStoppedSessionContinuitySurface(result);

    expect(surface?.kind).toBe("unsupported-future-edit");
    expect(surface?.actionableFailure).toEqual({
      blockerKind: "unsupported-future-edit",
      nextAction,
    });
    expect(surface?.failureHandoffDiagnostic).toContain(
      "blocker=unsupported-future-edit",
    );
    expect(JSON.stringify(result)).not.toContain("status: ready");
    expect(JSON.stringify(result)).not.toContain("status: draft");
  });

  it("preserves discovery edit manifest facts for continue without raw content", () => {
    const nextAction = "Confirm exactly one candidate path before any mutation can be considered.";
    const result = makeCodingResult({
      failedFiles: [
        {
          path: "src/app.ts, src/other.ts",
          reason: "Discovery edit found candidates but no exact target was confirmed.",
        },
      ],
      verification: {
        status: "blocked",
        reason: "Discovery edit found candidates but no exact target was confirmed.",
        blockerKind: "unknown",
        nextAction,
      },
      evidence: [
        "discovery-edit-result:manifest-produced",
        "discovery-edit-result:mutation-authority:not-granted",
        "discovery-edit-result:raw-content-excluded",
        "actionable-blocker-kind:unsupported-future-edit",
      ],
      continuation: {
        status: "failed-after-bounded-continuation",
        attempts: 1,
        evidence: [
          "discovery-edit manifest=discovery-edit-abc123; candidates=src/app.ts, src/other.ts; ambiguity=multiple-candidates; confirmation=required-target-selection; mutation:not-run; mutationAuthority:not-granted; raw-content-excluded",
          "discovery-edit-result:raw-content-excluded",
        ],
      },
    });

    const surface = deriveStoppedSessionContinuitySurface(result);

    expect(surface?.kind).toBe("unsupported-future-edit");
    expect(surface?.failureHandoffDiagnostic).toContain(
      "discovery=discovery-edit manifest=discovery-edit-abc123",
    );
    expect(surface?.failureHandoffDiagnostic).toContain(
      "confirmation=required-target-selection",
    );
    expect(surface?.failureHandoffDiagnostic).toContain(
      "mutationAuthority:not-granted",
    );
    expect(JSON.stringify(result)).not.toContain("status: ready");
    expect(JSON.stringify(result)).not.toContain("status: draft");
  });

  it("keeps MCP unavailable as an MCP blocker without file mutations", () => {
    const reason = "MCP tool mcp__localSdk__search is unavailable.";
    const result = makeCodingResult({
      taskKind: "run-command",
      verification: {
        status: "blocked",
        reason,
        blockerKind: "unknown",
        nextAction:
          "Run /mcp status and /mcp refresh localSdk before retrying.",
      },
      evidence: ["actionable-blocker-kind:mcp-unavailable"],
      failureBoundary: "unavailable-tool",
      provenance: {
        toolExecutions: [
          {
            kind: "unavailable-tool",
            source: "mcp-registry",
            legacySuccess: false,
            toolName: "mcp__localSdk__search",
            taskId: "task_mcp_unavailable",
            failureBoundary: "unavailable-tool",
          },
        ],
      },
    });

    const surface = deriveStoppedSessionContinuitySurface(result);

    expect(surface?.kind).toBe("mcp-unavailable");
    expect(surface?.failureHandoffDiagnostic).toContain(
      "blocker=mcp-unavailable",
    );
    expect(surface?.failureHandoffDiagnostic).not.toContain("target=");
    expect(result.changedFiles).toEqual([]);
    expect(result.failedFiles).toEqual([]);
  });

  it("keeps tool execution failure separate from approval denial", () => {
    const result = makeCodingResult({
      taskKind: "run-command",
      failedFiles: [
        {
          path: "(command)",
          reason: "bash execution failed after approval",
        },
      ],
      verification: {
        status: "blocked",
        command: "npm test -- src/app.test.ts",
        reason: "bash execution failed after approval",
        blockerKind: "unknown",
      },
      failureBoundary: "tool-execution-failed",
      provenance: {
        toolExecutions: [
          {
            kind: "executed-failed",
            source: "tool-result-metadata",
            legacySuccess: false,
            toolName: "bash",
            taskId: "task_tool_failure",
            failureBoundary: "tool-execution-failed",
          },
        ],
      },
    });

    const surface = deriveStoppedSessionContinuitySurface(result);

    expect(surface?.kind).toBe("tool-execution-failed");
    expect(surface?.actionableFailure?.blockerKind).toBeUndefined();
    expect(surface?.failureHandoffDiagnostic).toContain(
      "command=npm test -- src/app.test.ts",
    );
    expect(surface?.failureHandoffDiagnostic).not.toContain(
      "blocker=approval-denied",
    );
    expect(result.changedFiles).toEqual([]);
  });

  it("summarizes explicit restore availability for failed fenced edits", () => {
    const result = makeCodingResult({
      failedFiles: [
        {
          path: "src/app.ts",
          reason: "workspace writer failed after snapshot capture",
        },
      ],
      verification: {
        status: "failed",
        reason: "workspace writer failed after snapshot capture",
        blockerKind: "unknown",
      },
      recoverySurface: {
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
        restorableFiles: ["src/app.ts"],
        blockedFiles: [],
        recoveryAuthorityId: "authority-fenced",
        routeId: "fenced-edit-replacement",
        recoveryAction: "preview-restore",
        userFacingMessage:
          "Explicit guarded restore may be available. No automatic recovery ran.",
        evidence: ["recovery-surface:explicit-restore-only"],
      },
      evidence: [
        "edit-snapshot-status:snapshot-created",
        "edit-recovery-rollback:rollback-available",
        "actionable-blocker-kind:partial-mutation-failed",
      ],
      lastActionResultSeed: {
        actionKind: "edit-file",
        target: "src/app.ts",
        writerStarted: true,
        writeEffect: "unknown",
        requiresUserInspection: true,
        verification: {
          status: "failed",
          reason: "workspace writer failed after snapshot capture",
          blockerKind: "unknown",
        },
      },
    });

    const surface = deriveStoppedSessionContinuitySurface(result);

    expect(surface?.kind).toBe("writer-started-unknown");
    expect(surface?.failureHandoffDiagnostic).toContain(
      "restore-preview=available",
    );
    expect(surface?.failureHandoffDiagnostic).toContain(
      "automatic-rollback=no",
    );
    expect(JSON.stringify(surface)).not.toContain("status: draft");
  });

  it("falls back for generic stopped and error results", () => {
    const stopped = deriveStoppedSessionContinuitySurface(
      makeCodingResult({
        verification: {
          status: "blocked",
          reason: "Workflow stopped on blocker.",
          blockerKind: "unknown",
        },
      }),
    );
    const failed = deriveStoppedSessionContinuitySurface(
      makeCodingResult({
        verification: {
          status: "failed",
          reason: "command exited with code 1",
        },
      }),
    );

    expect(stopped?.kind).toBe("generic-stopped");
    expect(stopped?.failureHandoffDiagnostic).toContain(
      "Failure handoff: status=blocked",
    );
    expect(failed?.kind).toBe("generic-error");
    expect(failed?.failureHandoffDiagnostic).toContain(
      "Failure handoff: status=failed",
    );
  });

  it("does not fabricate changedFiles or failedFiles", () => {
    const result = makeCodingResult({
      changedFiles: [],
      failedFiles: [],
      verification: {
        status: "blocked",
        reason: "MCP server localSdk is unavailable.",
        blockerKind: "unknown",
      },
      evidence: ["actionable-blocker-kind:mcp-unavailable"],
    });

    deriveStoppedSessionContinuitySurface(result);

    expect(result.changedFiles).toEqual([]);
    expect(result.failedFiles).toEqual([]);
  });

  it("summarizes target-set partial failure without raw content or rollback success claims", () => {
    const result = makeCodingResult({
      changedFiles: ["src/a.ts"],
      failedFiles: [
        {
          path: "src/b.ts",
          reason: "fixture second write failed",
        },
      ],
      continuation: {
        status: "first-pass-success",
        attempts: 0,
        evidence: [
          "target-set-edit transaction=target-set-txn-abc123",
          "target-set-edit manifest=discovery-edit-abc123",
          "target-set-edit status=partial-failure",
          "target-set-edit changed=src/a.ts",
          "target-set-edit failed=src/b.ts",
          "target-set-edit unattempted=src/c.ts",
          "target-set-edit verification=failed",
          "target-set-edit recovery=available",
          "target-set-edit file=src/a.ts; state=written; rollback=rollback-ready",
          "target-set-edit file=src/b.ts; state=failed; rollback=rollback-ready",
          "target-set-edit-result:raw-content-excluded",
          "actionable-blocker-kind:partial-mutation-failed",
        ],
      },
      verification: {
        status: "failed",
        reason:
          "Inspect changed and failed files before retrying; rollback is explicit-only.",
        blockerKind: "unknown",
        nextAction:
          "Inspect changed and failed files before retrying; rollback is explicit-only.",
      },
      evidence: ["actionable-blocker-kind:partial-mutation-failed"],
      lastActionResultSeed: {
        actionKind: "edit-file",
        changedFiles: ["src/a.ts"],
        verifiedFiles: [],
        writerStarted: true,
        writeEffect: "unverified",
        requiresUserInspection: true,
        verification: {
          status: "failed",
          reason:
            "Inspect changed and failed files before retrying; rollback is explicit-only.",
          blockerKind: "unknown",
        },
      },
    });

    const surface = deriveStoppedSessionContinuitySurface(result);

    expect(surface?.kind).toBe("writer-started-unverified");
    expect(surface?.failureHandoffDiagnostic).toContain(
      "target-set=target-set-edit transaction=target-set-txn-abc123",
    );
    expect(surface?.failureHandoffDiagnostic).toContain("writer-started=yes");
    expect(surface?.failureHandoffDiagnostic).toContain(
      "requires-user-inspection=yes",
    );
    expect(surface?.failureHandoffDiagnostic).not.toContain("status: ready");
    expect(surface?.failureHandoffDiagnostic).not.toContain("rollback succeeded");
    expect(surface?.failureHandoffDiagnostic).not.toContain("atomic rollback");
  });

  it("summarizes explicit edit recovery apply without raw content", () => {
    const result = makeCodingResult({
      failedFiles: [
        {
          path: "src/a.ts",
          reason: "Explicit rollback apply requires direct rollback confirmation.",
        },
      ],
      continuation: {
        status: "failed-after-bounded-continuation",
        attempts: 0,
        evidence: [
          "edit-recovery-apply plan=edit-recovery-abc123",
          "edit-recovery-apply status=rollback-stopped",
          "edit-recovery-apply restored=none",
          "edit-recovery-apply failed=src/a.ts",
          "edit-recovery-result:raw-content-excluded",
        ],
      },
      verification: {
        status: "blocked",
        reason: "Explicit rollback apply requires direct rollback confirmation.",
        blockerKind: "unknown",
        nextAction: "Confirm the snapshot rollback before retrying.",
      },
      evidence: ["edit-recovery-result:raw-content-excluded"],
      lastActionResultSeed: {
        actionKind: "edit-file",
        changedFiles: [],
        verifiedFiles: [],
        reason: "Explicit rollback apply requires direct rollback confirmation.",
        blockerKind: "unknown",
        verification: {
          status: "blocked",
          reason: "Explicit rollback apply requires direct rollback confirmation.",
          blockerKind: "unknown",
        },
      },
    });

    const surface = deriveStoppedSessionContinuitySurface(result);

    expect(surface?.failureHandoffDiagnostic).toContain(
      "edit-recovery=edit-recovery-apply plan=edit-recovery-abc123",
    );
    expect(surface?.failureHandoffDiagnostic).not.toContain("status: draft");
    expect(surface?.failureHandoffDiagnostic).not.toContain("raw content");
  });
});

function makeCodingResult(
  overrides: Partial<CodingResultSummary> = {},
): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [],
    patches: [],
    repair: {
      status: "failed",
      attempts: 1,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "failed-after-bounded-continuation",
      attempts: 1,
      evidence: [],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: [],
      requiredEvidence: [],
      observedEvidence: [],
    },
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "blocked",
      reason: "Workflow stopped on blocker.",
      blockerKind: "unknown",
    },
    evidence: [],
    ...overrides,
  };
}
