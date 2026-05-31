import path from "node:path";
import { describe, expect, it } from "vitest";
import { digestSingleFileApplyPatchContent } from "../../../evidence/projection/patch/base.js";
import { buildSingleFileUpdatePatchApprovalContract } from "../../authority/approval/production.js";
import { buildSingleFileApplyPatchDryRun } from "../../patch/apply/dryRun.js";
import { buildSingleFileApplyPatchFinalStaleReadContract } from "./finalRead.js";
import { buildSingleFileApplyPatchPermissionUxContract } from "../../authority/approval/permission.js";
import { buildSingleFileApplyPatchStaleReadContract } from "../../patch/apply/staleRead.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("single-file apply_patch final stale-read revalidation before write contract", () => {
  it("passes unchanged final revalidation without becoming production-write-ready", () => {
    const permissionUx = permissionPreparedFixture();
    const result = buildSingleFileApplyPatchFinalStaleReadContract({
      permissionUx,
      currentContent: "old\n",
      phase: "final-write-preflight",
      writerCandidatePresent: true,
    });

    expect(result.finalRevalidation).toBe("passed");
    expect(result.blocker).toBeUndefined();
    expect(result.targetPath).toBe("src/app.ts");
    expect(result.reason).toContain("matches");
    expect(result.doesNotClaimProductionWriteReady).toBe(true);
    expect(result.nextAction).toContain("still not ready");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-final-stale-read:passed",
        "apply-patch-final-stale-read:base-evidence-matches-current-content",
        "apply-patch-final-stale-read:not-production-write-ready",
      ]),
    );
    expectNoWriteFinalRevalidation(result);
  });

  it("blocks changed current content as stale-read and keeps writer unreachable", () => {
    const permissionUx = permissionPreparedFixture();
    const result = buildSingleFileApplyPatchFinalStaleReadContract({
      permissionUx,
      currentContent: "changed\n",
      phase: "final-write-preflight",
      writerCandidatePresent: true,
    });

    expect(result.finalRevalidation).toBe("blocked");
    expect(result.blocker).toBe("stale-read");
    expect(result.reason).toContain("changed");
    expect(result.nextAction).toContain("Re-read");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-final-stale-read:stale-read",
        "apply-patch-final-stale-read:blocker:stale-read",
      ]),
    );
    expectNoWriteFinalRevalidation(result);
  });

  it("blocks changed current digest as stale-read without requiring current content comparison", () => {
    const permissionUx = permissionPreparedFixture();
    const result = buildSingleFileApplyPatchFinalStaleReadContract({
      permissionUx,
      currentContent: "old\n",
      currentDigest: digestSingleFileApplyPatchContent("changed\n"),
      phase: "final-write-preflight",
      writerCandidatePresent: true,
    });

    expect(result.finalRevalidation).toBe("blocked");
    expect(result.blocker).toBe("stale-read");
    expectNoWriteFinalRevalidation(result);
  });

  it("blocks missing current content as target-missing and never reaches writer", () => {
    const permissionUx = permissionPreparedFixture();
    const result = buildSingleFileApplyPatchFinalStaleReadContract({
      permissionUx,
      currentContent: undefined,
      phase: "final-write-preflight",
      writerCandidatePresent: true,
    });

    expect(result.finalRevalidation).toBe("blocked");
    expect(result.blocker).toBe("target-missing");
    expect(result.reason).toContain("missing");
    expect(result.nextAction).toContain("Re-read");
    expectNoWriteFinalRevalidation(result);
  });

  it("blocks permission pending without prepared approval token as permission-not-ready", () => {
    const dryRunResult = dryRun({ "src/app.ts": "old\n" });
    const staleRead = buildSingleFileApplyPatchStaleReadContract({
      baseEvidence: expectBaseEvidence(dryRunResult.baseEvidence),
      currentContent: "old\n",
      phase: "write-decision-dry-run",
      dryRun: true,
    });
    const approval = buildSingleFileUpdatePatchApprovalContract(
      buildReadinessFromDryRunApproval(dryRunResult.approval),
      { staleRead },
    );
    const permissionUx = buildSingleFileApplyPatchPermissionUxContract({
      dryRunResult,
      approval,
      promptText: "approved keyword is not explicit UX approval",
    });
    const result = buildSingleFileApplyPatchFinalStaleReadContract({
      permissionUx,
      currentContent: "old\n",
      phase: "final-write-preflight",
      writerCandidatePresent: true,
    });

    expect(permissionUx.permissionDecision).toBe("pending");
    expect(permissionUx.approvalTokenPrepared).toBe(false);
    expect(result.finalRevalidation).toBe("blocked");
    expect(result.blocker).toBe("permission-not-ready");
    expectNoWriteFinalRevalidation(result);
  });

  it("does not let denied or blocked permission upgrade to write-ready", () => {
    const denied = buildSingleFileApplyPatchFinalStaleReadContract({
      permissionUx: permissionPreparedFixture("denied"),
      currentContent: "old\n",
      phase: "final-write-preflight",
      writerCandidatePresent: true,
    });
    const blocked = buildSingleFileApplyPatchFinalStaleReadContract({
      permissionUx: buildSingleFileApplyPatchPermissionUxContract({
        requestedUserDecision: "approved",
      }),
      currentContent: "old\n",
      phase: "final-write-preflight",
      writerCandidatePresent: true,
    });

    expect(denied.finalRevalidation).toBe("blocked");
    expect(denied.blocker).toBe("permission-not-ready");
    expect(blocked.finalRevalidation).toBe("blocked");
    expect(blocked.blocker).toBe("permission-not-ready");
    expectNoWriteFinalRevalidation(denied);
    expectNoWriteFinalRevalidation(blocked);
  });

  it("does not leak baseContent through final revalidation evidence", () => {
    const result = buildSingleFileApplyPatchFinalStaleReadContract({
      permissionUx: permissionPreparedFixture(),
      currentContent: "old\n",
      phase: "final-write-preflight",
      writerCandidatePresent: true,
    });

    expect(result.baseEvidence).toEqual(
      expect.objectContaining({
        targetPath: "src/app.ts",
        digestAlgorithm: "sha256",
        capturedAtPhase: "dry-run-preview",
        source: "verify-readFile",
      }),
    );
    expect(result.baseEvidence?.baseDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain("baseContent");
    expect(JSON.stringify(result)).not.toContain("old\n");
  });
});

type DryRunResult = ReturnType<typeof buildSingleFileApplyPatchDryRun>;
type Approval = DryRunResult["approval"];
type FinalStaleReadResult = ReturnType<
  typeof buildSingleFileApplyPatchFinalStaleReadContract
>;

function permissionPreparedFixture(
  requestedUserDecision: "approved" | "denied" = "approved",
): ReturnType<typeof buildSingleFileApplyPatchPermissionUxContract> {
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

function expectNoWriteFinalRevalidation(result: FinalStaleReadResult): void {
  expect(result.writerCandidatePresent).toBe(true);
  expect(result.writerReachable).toBe(false);
  expect(result.willWrite).toBe(false);
  expect(result.changedFiles).toEqual([]);
  expect(result.writeIntents).toEqual([]);
  expect(result.noWriterInvoked).toBe(true);
  expect(result.doesNotClaimProductionWriteReady).toBe(true);
  expect(result.evidence).toEqual(
    expect.arrayContaining([
      "apply-patch-final-stale-read:writer-unreachable",
      "apply-patch-final-stale-read:will-write-false",
      "apply-patch-final-stale-read:changed-files-empty",
      "apply-patch-final-stale-read:write-intents-empty",
      "apply-patch-final-stale-read:no-writer-invoked",
      "apply-patch-final-stale-read:not-production-write-ready",
    ]),
  );
  expect(result.evidence).not.toContain("write-success");
  expect(result.evidence).not.toContain("production-write-ready");
}
