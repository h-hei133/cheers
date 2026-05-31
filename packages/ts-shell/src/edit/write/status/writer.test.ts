import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSingleFileUpdatePatchApprovalContract } from "../../authority/approval/production.js";
import { buildSingleFileApplyPatchDryRun } from "../../patch/apply/dryRun.js";
import { buildSingleFileApplyPatchFinalStaleReadContract } from "../runtime/finalRead.js";
import { buildSingleFileApplyPatchPermissionUxContract } from "../../authority/approval/permission.js";
import { buildSingleFileApplyPatchStaleReadContract } from "../../patch/apply/staleRead.js";
import {
  buildSingleFileApplyPatchWriterBoundaryContract,
  type SingleFileApplyPatchUnsupportedOperation,
} from "./writer.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("single-file apply_patch writer boundary proof contract", () => {
  it("keeps writer unreachable when permission is pending without prepared approval", () => {
    const dryRunResult = dryRun({ "src/app.ts": "old\n" });
    const permissionUx = buildSingleFileApplyPatchPermissionUxContract({
      dryRunResult,
      promptText: "approved keyword is ignored",
    });
    const finalStaleRead = buildSingleFileApplyPatchFinalStaleReadContract({
      permissionUx,
      currentContent: "old\n",
      phase: "final-write-preflight",
      writerCandidatePresent: true,
    });
    const boundary = buildSingleFileApplyPatchWriterBoundaryContract({
      permissionUx,
      finalStaleRead,
    });

    expect(boundary.blockedBy).toBe("permission");
    expect(boundary.writerReachabilityReason).toContain("permission UX");
    expectNoWriterBoundaryLeak(boundary);
  });

  it("keeps writer unreachable when permission is denied or blocked", () => {
    const deniedPermission = permissionPreparedFixture("denied");
    const deniedFinal = buildSingleFileApplyPatchFinalStaleReadContract({
      permissionUx: deniedPermission,
      currentContent: "old\n",
      phase: "final-write-preflight",
      writerCandidatePresent: true,
    });
    const deniedBoundary = buildSingleFileApplyPatchWriterBoundaryContract({
      permissionUx: deniedPermission,
      finalStaleRead: deniedFinal,
    });

    const blockedPermission = buildSingleFileApplyPatchPermissionUxContract({
      requestedUserDecision: "approved",
    });
    const blockedFinal = buildSingleFileApplyPatchFinalStaleReadContract({
      permissionUx: blockedPermission,
      currentContent: "old\n",
      phase: "final-write-preflight",
      writerCandidatePresent: true,
    });
    const blockedBoundary = buildSingleFileApplyPatchWriterBoundaryContract({
      permissionUx: blockedPermission,
      finalStaleRead: blockedFinal,
    });

    expect(deniedBoundary.blockedBy).toBe("permission");
    expect(blockedBoundary.blockedBy).toBe("permission");
    expectNoWriterBoundaryLeak(deniedBoundary);
    expectNoWriterBoundaryLeak(blockedBoundary);
  });

  it("keeps writer unreachable when final stale-read blocks stale content", () => {
    const permissionUx = permissionPreparedFixture();
    const finalStaleRead = buildSingleFileApplyPatchFinalStaleReadContract({
      permissionUx,
      currentContent: "changed\n",
      phase: "final-write-preflight",
      writerCandidatePresent: true,
    });
    const boundary = buildSingleFileApplyPatchWriterBoundaryContract({
      permissionUx,
      finalStaleRead,
      singleFileUpdateIntentCandidate: updateCandidate(),
    });

    expect(finalStaleRead.blocker).toBe("stale-read");
    expect(boundary.blockedBy).toBe("final-stale-read");
    expect(boundary.writerReachabilityReason).toContain("stale-read");
    expectNoWriterBoundaryLeak(boundary);
  });

  it("keeps writer unreachable when final stale-read blocks missing target", () => {
    const permissionUx = permissionPreparedFixture();
    const finalStaleRead = buildSingleFileApplyPatchFinalStaleReadContract({
      permissionUx,
      currentContent: undefined,
      phase: "final-write-preflight",
      writerCandidatePresent: true,
    });
    const boundary = buildSingleFileApplyPatchWriterBoundaryContract({
      permissionUx,
      finalStaleRead,
      singleFileUpdateIntentCandidate: updateCandidate(),
    });

    expect(finalStaleRead.blocker).toBe("target-missing");
    expect(boundary.blockedBy).toBe("final-stale-read");
    expect(boundary.writerReachabilityReason).toContain("target-missing");
    expectNoWriterBoundaryLeak(boundary);
  });

  it("keeps writer unreachable for multi-file/add/delete/move unsupported operations", () => {
    for (const unsupportedOperation of [
      "multi-file",
      "add",
      "delete",
      "move",
    ] as const satisfies readonly SingleFileApplyPatchUnsupportedOperation[]) {
      const permissionUx = permissionPreparedFixture();
      const finalStaleRead = finalPassedFixture(permissionUx);
      const boundary = buildSingleFileApplyPatchWriterBoundaryContract({
        permissionUx,
        finalStaleRead,
        singleFileUpdateIntentCandidate: updateCandidate(),
        unsupportedOperation,
      });

      expect(boundary.blockedBy).toBe("unsupported-operation");
      expect(boundary.unsupportedOperation).toBe(unsupportedOperation);
      expect(boundary.writerReachabilityReason).toContain(unsupportedOperation);
      expectNoWriterBoundaryLeak(boundary);
    }
  });

  it("keeps writer unreachable even when all contract prerequisites pass", () => {
    const permissionUx = permissionPreparedFixture();
    const finalStaleRead = finalPassedFixture(permissionUx);
    const boundary = buildSingleFileApplyPatchWriterBoundaryContract({
      permissionUx,
      finalStaleRead,
      singleFileUpdateIntentCandidate: updateCandidate(),
    });

    expect(permissionUx.approvalTokenPrepared).toBe(true);
    expect(finalStaleRead.finalRevalidation).toBe("passed");
    expect(boundary.blockedBy).toBe("not-production-wiring");
    expect(boundary.writerReachabilityReason).toContain("does not approve production wiring");
    expectNoWriterBoundaryLeak(boundary);
  });
});

type DryRunResult = ReturnType<typeof buildSingleFileApplyPatchDryRun>;
type Approval = DryRunResult["approval"];
type PermissionUx = ReturnType<typeof buildSingleFileApplyPatchPermissionUxContract>;
type WriterBoundary = ReturnType<typeof buildSingleFileApplyPatchWriterBoundaryContract>;

function permissionPreparedFixture(
  requestedUserDecision: "approved" | "denied" = "approved",
): PermissionUx {
  const dryRunResult = dryRun({ "src/app.ts": "old\n" });
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
  return buildSingleFileApplyPatchPermissionUxContract({
    dryRunResult,
    approval,
    requestedUserDecision,
  });
}

function finalPassedFixture(permissionUx: PermissionUx) {
  return buildSingleFileApplyPatchFinalStaleReadContract({
    permissionUx,
    currentContent: "old\n",
    phase: "final-write-preflight",
    writerCandidatePresent: true,
  });
}

function updateCandidate() {
  return {
    candidatePresent: true,
    operationKind: "update" as const,
    targetPath: "src/app.ts",
    singleFileOnly: true,
  };
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

function expectBaseEvidence(baseEvidence: DryRunResult["baseEvidence"]) {
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

function expectNoWriterBoundaryLeak(boundary: WriterBoundary): void {
  expect(boundary.writerReachable).toBe(false);
  expect(boundary.willWrite).toBe(false);
  expect(boundary.changedFiles).toEqual([]);
  expect(boundary.writeIntents).toEqual([]);
  expect(boundary.noWriterInvoked).toBe(true);
  expect(boundary.noAppliedPatchRecord).toBe(true);
  expect(boundary.doesNotClaimWriteSuccess).toBe(true);
  expect(boundary.doesNotClaimProductionWriteReady).toBe(true);
  expect(boundary.evidence).toEqual(
    expect.arrayContaining([
      "apply-patch-writer-boundary:contract-only",
      "apply-patch-writer-boundary:writer-reachable-false",
      "apply-patch-writer-boundary:will-write-false",
      "apply-patch-writer-boundary:changed-files-empty",
      "apply-patch-writer-boundary:write-intents-empty",
      "apply-patch-writer-boundary:no-writer-invoked",
      "apply-patch-writer-boundary:no-applied-patch-record",
      "apply-patch-writer-boundary:no-write-success-claim",
      "apply-patch-writer-boundary:not-production-write-ready",
    ]),
  );
  expect(boundary.evidence).not.toContain("write-success");
  expect(boundary.evidence).not.toContain("production-write-ready");
}
