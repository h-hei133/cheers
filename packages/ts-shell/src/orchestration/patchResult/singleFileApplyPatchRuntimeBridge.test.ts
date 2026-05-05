import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSingleFileUpdatePatchApprovalContract } from "./productionGate.js";
import { buildSingleFileApplyPatchDryRun } from "./singleFileApplyPatchDryRun.js";
import { buildSingleFileApplyPatchRuntimeBridge } from "./singleFileApplyPatchRuntimeBridge.js";
import { buildSingleFileApplyPatchStaleReadContract } from "./singleFileApplyPatchStaleRead.js";
import {
  buildSingleFileApplyPatchTerminalSurface,
  type SingleFileApplyPatchTerminalSurface,
} from "./singleFileApplyPatchTerminalSurface.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("single-file apply_patch resultMapper/sessionRuntime runtime bridge contract", () => {
  it("bridges a dry-run-ready terminal surface without mutation success", () => {
    const bridge = buildSingleFileApplyPatchRuntimeBridge({
      terminalSurface: dryRunReadySurface(),
    });

    expect(bridge.source).toBe("single-file-apply-patch-terminal-surface");
    expect(bridge.status).toBe("dry-run-ready");
    expect(bridge.mapperSafe).toBe(true);
    expect(bridge.sessionSafe).toBe(true);
    expect(bridge.wouldChangeFiles).toEqual(["src/app.ts"]);
    expect(bridge.previewChangedFiles).toEqual(["src/app.ts"]);
    expect(bridge.codingResultProjection.verification.status).not.toBe("passed");
    expect(bridge.codingResultProjection.verification.status).toBe("not-requested");
    expect(bridge.codingResultProjection.taskSatisfaction.verdict).not.toBe(
      "satisfied",
    );
    expect(bridge.codingResultProjection.taskSatisfaction.verdict).toBe(
      "completed-with-caveats",
    );
    expectBridgeNoWriteSuccess(bridge);
  });

  it("bridges a permission-pending terminal surface as blocked-for-runtime and not satisfied", () => {
    const bridge = buildSingleFileApplyPatchRuntimeBridge({
      terminalSurface: permissionPendingSurface(),
    });

    expect(bridge.status).toBe("permission-pending");
    expect(bridge.codingResultProjection.verification.status).toBe("blocked");
    expect(bridge.codingResultProjection.verification.blockerKind).toBe(
      "permission-pending",
    );
    expect(bridge.codingResultProjection.verification.nextAction).toContain(
      "explicit permission",
    );
    expect(bridge.codingResultProjection.taskSatisfaction.verdict).not.toBe(
      "satisfied",
    );
    expect(bridge.approval.decision).toBe("pending");
    expectBridgeNoWriteSuccess(bridge);
  });

  it("bridges stale-read blocked with blocker reason and actionable next action", () => {
    const bridge = buildSingleFileApplyPatchRuntimeBridge({
      terminalSurface: staleReadBlockedSurface(),
    });

    expect(bridge.status).toBe("blocked");
    expect(bridge.codingResultProjection.verification.status).toBe("blocked");
    expect(bridge.codingResultProjection.verification.blockerKind).toBe(
      "stale-read",
    );
    expect(bridge.codingResultProjection.failedFiles).toEqual([
      {
        path: "src/app.ts",
        reason:
          "Single-file apply_patch write decision is blocked because the target changed after preview.",
      },
    ]);
    expect(bridge.codingResultProjection.patches).toEqual([
      expect.objectContaining({
        path: "src/app.ts",
        status: "failed",
        failureCode: "stale-read",
      }),
    ]);
    expect(bridge.nextAction).toContain("Re-read");
    expect(bridge.doNext).toBe(bridge.nextAction);
    expectBridgeNoWriteSuccess(bridge);
  });

  it("bridges target-missing blocked with blocker reason and actionable next action", () => {
    const bridge = buildSingleFileApplyPatchRuntimeBridge({
      terminalSurface: targetMissingBlockedSurface(),
    });

    expect(bridge.status).toBe("blocked");
    expect(bridge.codingResultProjection.verification.status).toBe("blocked");
    expect(bridge.codingResultProjection.verification.blockerKind).toBe(
      "target-missing",
    );
    expect(bridge.codingResultProjection.failedFiles[0]).toEqual({
      path: "src/app.ts",
      reason:
        "Single-file apply_patch write decision is blocked because the target is missing after preview.",
    });
    expect(bridge.codingResultProjection.patches[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        failureCode: "patch-target-missing",
      }),
    );
    expect(bridge.nextAction).toContain("Re-read");
    expectBridgeNoWriteSuccess(bridge);
  });

  it("keeps preview files out of changedFiles across all bridge statuses", () => {
    for (const surface of [
      dryRunReadySurface(),
      permissionPendingSurface(),
      staleReadBlockedSurface(),
      targetMissingBlockedSurface(),
    ]) {
      const bridge = buildSingleFileApplyPatchRuntimeBridge({
        terminalSurface: surface,
      });

      expect(bridge.changedFiles).toEqual([]);
      expect(bridge.codingResultProjection.changedFiles).toEqual([]);
      expect(bridge.wouldChangeFiles).toEqual(surface.wouldChangeFiles);
      expect(bridge.previewChangedFiles).toEqual(surface.previewChangedFiles);
      expect(bridge.terminalSafetyProof.previewFilesOnlyInWouldChangeFiles).toBe(
        true,
      );
      expectBridgeNoWriteSuccess(bridge);
    }
  });
});

function dryRunReadySurface(): SingleFileApplyPatchTerminalSurface {
  return buildSingleFileApplyPatchTerminalSurface({
    dryRun: dryRun({
      "src/app.ts": "old\n",
    }),
  });
}

function permissionPendingSurface(): SingleFileApplyPatchTerminalSurface {
  const dryRunResult = dryRun({
    "src/app.ts": "old\n",
  });
  const staleRead = buildSingleFileApplyPatchStaleReadContract({
    baseEvidence: expectBaseEvidence(dryRunResult.baseEvidence),
    currentContent: "old\n",
    phase: "write-decision-dry-run",
    dryRun: true,
  });
  const approval = buildSingleFileUpdatePatchApprovalContract(
    buildReadinessFromDryRunApproval(dryRunResult.approval),
    {
      staleRead,
      decision: "approved",
    },
  );
  return buildSingleFileApplyPatchTerminalSurface({
    dryRun: dryRunResult,
    staleRead,
    approval,
  });
}

function staleReadBlockedSurface(): SingleFileApplyPatchTerminalSurface {
  const dryRunResult = dryRun({
    "src/app.ts": "old\n",
  });
  const staleRead = buildSingleFileApplyPatchStaleReadContract({
    baseEvidence: expectBaseEvidence(dryRunResult.baseEvidence),
    currentContent: "changed\n",
    phase: "write-decision-dry-run",
    dryRun: true,
  });
  const approval = buildSingleFileUpdatePatchApprovalContract(
    buildReadinessFromDryRunApproval(dryRunResult.approval),
    { staleRead },
  );
  return buildSingleFileApplyPatchTerminalSurface({
    dryRun: dryRunResult,
    staleRead,
    approval,
  });
}

function targetMissingBlockedSurface(): SingleFileApplyPatchTerminalSurface {
  const dryRunResult = dryRun({
    "src/app.ts": "old\n",
  });
  const staleRead = buildSingleFileApplyPatchStaleReadContract({
    baseEvidence: expectBaseEvidence(dryRunResult.baseEvidence),
    currentContent: undefined,
    phase: "write-decision-dry-run",
    dryRun: true,
  });
  const approval = buildSingleFileUpdatePatchApprovalContract(
    buildReadinessFromDryRunApproval(dryRunResult.approval),
    { staleRead },
  );
  return buildSingleFileApplyPatchTerminalSurface({
    dryRun: dryRunResult,
    staleRead,
    approval,
  });
}

function dryRun(
  files: Readonly<Record<string, string>>,
): ReturnType<typeof buildSingleFileApplyPatchDryRun> {
  return buildSingleFileApplyPatchDryRun({
    workspaceRoot,
    rawPatchText: [
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "@@",
      "-old",
      "+new",
      "*** End Patch",
    ].join("\n"),
    dryRun: true,
    readFile: (absolutePath) => files[path.relative(workspaceRoot, absolutePath)],
  });
}

type DryRunResult = ReturnType<typeof buildSingleFileApplyPatchDryRun>;
type BaseEvidence = NonNullable<DryRunResult["baseEvidence"]>;
type Approval = DryRunResult["approval"];
type RuntimeBridge = ReturnType<typeof buildSingleFileApplyPatchRuntimeBridge>;

function expectBaseEvidence(
  baseEvidence: DryRunResult["baseEvidence"],
): BaseEvidence {
  if (!baseEvidence) {
    throw new Error("Expected dry-run base evidence");
  }
  return baseEvidence;
}

function buildReadinessFromDryRunApproval(
  approval: Approval,
): Parameters<typeof buildSingleFileUpdatePatchApprovalContract>[0] {
  if (approval.decision !== "pending") {
    throw new Error("Expected dry-run approval metadata to be pending");
  }
  return {
    ready: true,
    permissionMetadata: {
      capability: "single-file-update-apply-patch-readiness",
      operationKind: "update",
      targetPath: approval.targetPath,
      previewSummary: approval.metadata.previewSummary,
      additions: approval.metadata.additions,
      deletions: approval.metadata.deletions,
      singleFileOnly: true,
      unsupportedOperations: ["multi-file", "add", "delete", "move"],
      willWrite: false,
    },
    result: {
      status: "ready",
      changedFiles: approval.targetPath ? [approval.targetPath] : [],
      failedFiles: [],
      patches: approval.metadata.files.map((file) => ({
        path: file.path,
        operation: "update" as const,
        status: "previewed" as const,
        additions: file.additions,
        deletions: file.deletions,
      })),
      evidence: ["test:readiness-from-dry-run-approval"],
      nextAction: "Keep this contract no-write.",
    },
    noPartial: {
      atomicity: "verify-all-before-write",
      writeIntents: 1,
      blockedWrites: false,
    },
  };
}

function expectBridgeNoWriteSuccess(bridge: RuntimeBridge): void {
  expect(bridge.mapperSafe).toBe(true);
  expect(bridge.sessionSafe).toBe(true);
  expect(bridge.willWrite).toBe(false);
  expect(bridge.changedFiles).toEqual([]);
  expect(bridge.writeIntents).toEqual([]);
  expect(bridge.approval.decision).toMatch(/^(pending|blocked|denied)$/);
  expect(bridge.approval.decision).not.toBe("approved");
  expect(bridge.approval.writeIntent).toEqual({ authorized: false, count: 0 });
  expect(bridge.codingResultProjection.changedFiles).toEqual([]);
  expect(bridge.codingResultProjection.verification.status).not.toBe("passed");
  expect(bridge.codingResultProjection.taskSatisfaction.verdict).not.toBe(
    "satisfied",
  );
  expect(
    bridge.codingResultProjection.patches.every(
      (patch) => patch.status !== "applied",
    ),
  ).toBe(true);
  expect(bridge.codingResultProjection.evidence).toEqual(
    expect.arrayContaining([
      "apply-patch-runtime-bridge:mapper-safe",
      "apply-patch-runtime-bridge:session-safe",
      "apply-patch-runtime-bridge:no-mutation-success",
      "apply-patch-runtime-bridge:no-write-success",
      "apply-patch-runtime-bridge:no-applied-patch-record",
    ]),
  );
  expect(bridge.codingResultProjection.evidence).not.toContain("write-success");
  expect(bridge.codingResultProjection.evidence).not.toContain(
    "mutation-success",
  );
  expect(bridge.terminalSafetyProof).toEqual({
    noMutationSuccess: true,
    noWriteSuccess: true,
    noAppliedPatchRecord: true,
    noApprovedDecision: true,
    noChangedFiles: true,
    previewFilesOnlyInWouldChangeFiles: true,
  });
}
