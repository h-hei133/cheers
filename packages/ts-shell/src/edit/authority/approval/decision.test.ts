import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSingleFileUpdatePatchApprovalContract } from "./production.js";
import { buildSingleFileApplyPatchDryRun } from "../../patch/apply/dryRun.js";
import { buildSingleFileApplyPatchPermissionUxContract } from "./permission.js";
import { buildSingleFileApplyPatchStaleReadContract } from "../../patch/apply/staleRead.js";
import { buildWriteDecisionGate } from "./decision.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("single-file apply_patch write decision gate contract", () => {
  it("does not infer approved-for-write from prompt text or prepared metadata", () => {
    const permissionUx = permissionPreparedFixture();
    const decision = buildWriteDecisionGate({
      permissionUx,
      explicitApprovedForWrite: false,
      promptText: "approved, write it now",
    });

    expect(permissionUx.approvalTokenPrepared).toBe(true);
    expect(decision.status).toBe("pending");
    expect(decision.blocker).toBe("explicit-approval-missing");
    expect(decision.promptApprovalIgnored).toBe(true);
    expect(decision.approvalMetadataDoesNotAuthorizeWrite).toBe(true);
    expectNoWriteDecisionLeak(decision);
  });

  it("keeps denied and blocked permission decisions out of write authorization", () => {
    const denied = buildWriteDecisionGate({
      permissionUx: permissionPreparedFixture("denied"),
      explicitApprovedForWrite: true,
    });
    const blocked = buildWriteDecisionGate({
      permissionUx: buildSingleFileApplyPatchPermissionUxContract({
        requestedUserDecision: "approved",
      }),
      explicitApprovedForWrite: true,
    });

    expect(denied.status).toBe("denied");
    expect(blocked.status).toBe("blocked");
    expectNoWriteDecisionLeak(denied);
    expectNoWriteDecisionLeak(blocked);
  });

  it("requires digest-bound base evidence and stale-read precondition", () => {
    const withoutBaseEvidence = buildSingleFileApplyPatchPermissionUxContract({
      staleReadPrecondition: {
        phase: "write-decision-dry-run",
        requiredBefore: "write-decision",
        blocksWriteOn: ["stale-read", "target-missing"],
      },
      requestedUserDecision: "approved",
    });
    const withoutStaleRead = buildSingleFileApplyPatchPermissionUxContract({
      baseEvidence: expectBaseEvidence(dryRun().baseEvidence),
      requestedUserDecision: "approved",
    });

    const missingBase = buildWriteDecisionGate({
      permissionUx: withoutBaseEvidence,
      explicitApprovedForWrite: true,
    });
    const missingStaleRead = buildWriteDecisionGate({
      permissionUx: withoutStaleRead,
      explicitApprovedForWrite: true,
    });

    expect(missingBase.status).toBe("blocked");
    expect(missingBase.blocker).toBe("permission-not-ready");
    expect(missingStaleRead.status).toBe("blocked");
    expect(missingStaleRead.blocker).toBe("permission-not-ready");
    expectNoWriteDecisionLeak(missingBase);
    expectNoWriteDecisionLeak(missingStaleRead);
  });

  it("produces approved-for-write only for explicit prepared approval and still requires final stale-read", () => {
    const permissionUx = permissionPreparedFixture();
    const decision = buildWriteDecisionGate({
      permissionUx,
      explicitApprovedForWrite: true,
    });

    expect(decision.status).toBe("approved-for-write");
    expect(decision.baseEvidenceDigestBound).toBe(true);
    expect(decision.staleReadPreconditionBound).toBe(true);
    expect(decision.finalStaleReadRequired).toBe(true);
    expect(decision.finalStaleReadRequiredAfterApproval).toBe(true);
    expect(decision.nextAction).toContain("final stale-read");
    expectNoWriteDecisionLeak(decision);
  });
});

type DryRunResult = ReturnType<typeof buildSingleFileApplyPatchDryRun>;
type Approval = DryRunResult["approval"];
type PermissionUx = ReturnType<typeof buildSingleFileApplyPatchPermissionUxContract>;
type WriteDecision = ReturnType<typeof buildWriteDecisionGate>;

function permissionPreparedFixture(
  requestedUserDecision: "approved" | "denied" = "approved",
): PermissionUx {
  const dryRunResult = dryRun();
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

function dryRun(): ReturnType<typeof buildSingleFileApplyPatchDryRun> {
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
    readFile: (absolutePath) => {
      if (path.relative(workspaceRoot, absolutePath) === "src/app.ts") {
        return "old\n";
      }
      return undefined;
    },
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

function expectNoWriteDecisionLeak(decision: WriteDecision): void {
  expect(decision.willWrite).toBe(false);
  expect(decision.changedFiles).toEqual([]);
  expect(decision.writeIntents).toEqual([]);
  expect(decision.noWriterInvoked).toBe(true);
  expect(decision.noAppliedPatchRecord).toBe(true);
  expect(decision.doesNotClaimMutationSuccess).toBe(true);
  expect(decision.doesNotClaimWriteSuccess).toBe(true);
  expect(decision.dryRunDoesNotAuthorizeWrite).toBe(true);
  expect(decision.evidence).toEqual(
    expect.arrayContaining([
      "apply-patch-write-decision:contract",
      "apply-patch-write-decision:final-stale-read-required-after-approval",
      "apply-patch-write-decision:no-prompt-keyword-approval",
      "apply-patch-write-decision:approval-metadata-not-write-authorization",
      "apply-patch-write-decision:dry-run-not-write-authorization",
      "apply-patch-write-decision:will-write-false",
      "apply-patch-write-decision:changed-files-empty",
      "apply-patch-write-decision:write-intents-empty",
      "apply-patch-write-decision:no-writer-invoked",
      "apply-patch-write-decision:no-applied-patch-record",
      "apply-patch-write-decision:no-success-claim",
    ]),
  );
  expect(decision.evidence).not.toContain("write-success");
  expect(decision.evidence).not.toContain("mutation-success");
}
