import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSingleFileUpdatePatchApprovalContract } from "./production.js";
import { buildSingleFileApplyPatchDryRun } from "../../patch/apply/dryRun.js";
import { buildSingleFileApplyPatchPermissionUxContract } from "./permission.js";
import { buildSingleFileApplyPatchStaleReadContract } from "../../patch/apply/staleRead.js";
import { buildSingleFileApplyPatchTerminalSurface } from "../../../result/projection/patch/terminal.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("single-file apply_patch explicit permission UX path contract", () => {
  it("keeps explicit approval request pending and never authorizes a write intent", () => {
    const { dryRunResult, approval } = approvedRequestFixture();
    const contract = buildSingleFileApplyPatchPermissionUxContract({
      dryRunResult,
      approval,
      requestedUserDecision: "approved",
    });

    expect(contract.permissionDecision).toBe("pending");
    expect(contract.approvalReady).toBe(false);
    expect(contract.approvalTokenPrepared).toBe(true);
    expect(contract.baseEvidenceDigestBound).toBe(true);
    expect(contract.staleReadPreconditionRequired).toBe(true);
    expect(contract.writeIntent).toEqual({ authorized: false, count: 0 });
    expect(contract.requestedApprovedDoesNotAuthorizeWrite).toBe(true);
    expectNoWriteContract(contract);
  });

  it("does not infer approval from prompt keywords or bare metadata", () => {
    const dryRunResult = dryRun({ "src/app.ts": "old\n" });
    const terminalSurface = buildSingleFileApplyPatchTerminalSurface({
      dryRun: dryRunResult,
    });
    const contract = buildSingleFileApplyPatchPermissionUxContract({
      terminalSurface,
      promptText: "approved, please apply this patch now",
    });

    expect(contract.permissionDecision).toBe("pending");
    expect(contract.approvalTokenPrepared).toBe(false);
    expect(contract.doesNotInferApprovalFromPrompt).toBe(true);
    expect(contract.evidence).toContain(
      "apply-patch-permission-ux:prompt-text-ignored-for-authorization",
    );
    expectNoWriteContract(contract);
  });

  it("blocks when baseEvidence is missing", () => {
    const dryRunResult = dryRun({ "src/app.ts": "old\n" });
    const approvalMetadata = {
      ...dryRunResult.approval.metadata,
      baseEvidence: undefined,
    };
    const contract = buildSingleFileApplyPatchPermissionUxContract({
      approvalMetadata,
      staleReadPrecondition: staleReadPrecondition(),
      requestedUserDecision: "approved",
    });

    expect(contract.permissionDecision).toBe("blocked");
    expect(contract.blocker).toBe("base-evidence-missing");
    expect(contract.baseEvidenceDigestBound).toBe(false);
    expect(contract.approvalTokenPrepared).toBe(false);
    expectNoWriteContract(contract);
  });

  it("blocks when stale-read precondition is missing", () => {
    const dryRunResult = dryRun({ "src/app.ts": "old\n" });
    const contract = buildSingleFileApplyPatchPermissionUxContract({
      baseEvidence: expectBaseEvidence(dryRunResult.baseEvidence),
      approvalMetadata: dryRunResult.approval.metadata,
      requestedUserDecision: "approved",
    });

    expect(contract.permissionDecision).toBe("blocked");
    expect(contract.blocker).toBe("stale-read-precondition-missing");
    expect(contract.staleReadPreconditionRequired).toBe(false);
    expect(contract.approvalTokenPrepared).toBe(false);
    expectNoWriteContract(contract);
  });

  it("keeps denied decision non-write and non-production-ready", () => {
    const { dryRunResult, approval } = approvedRequestFixture();
    const contract = buildSingleFileApplyPatchPermissionUxContract({
      dryRunResult,
      approval,
      requestedUserDecision: "denied",
    });

    expect(contract.permissionDecision).toBe("denied");
    expect(contract.approvalTokenPrepared).toBe(false);
    expect(contract.nextAction).toContain("Do not write");
    expectNoWriteContract(contract);
  });

  it("does not leak baseContent while binding digest-only base evidence", () => {
    const { dryRunResult, approval } = approvedRequestFixture();
    const contract = buildSingleFileApplyPatchPermissionUxContract({
      dryRunResult,
      approval,
      requestedUserDecision: "approved",
    });

    expect(contract.baseEvidence).toEqual(
      expect.objectContaining({
        targetPath: "src/app.ts",
        digestAlgorithm: "sha256",
        capturedAtPhase: "dry-run-preview",
        source: "verify-readFile",
      }),
    );
    expect(contract.baseEvidence?.baseDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(contract)).not.toContain("baseContent");
    expect(JSON.stringify(contract)).not.toContain("old\n");
    expectNoWriteContract(contract);
  });
});

type PermissionUxContract = ReturnType<
  typeof buildSingleFileApplyPatchPermissionUxContract
>;
type DryRunResult = ReturnType<typeof buildSingleFileApplyPatchDryRun>;
type BaseEvidence = NonNullable<DryRunResult["baseEvidence"]>;
type Approval = DryRunResult["approval"];

function approvedRequestFixture(): {
  readonly dryRunResult: DryRunResult;
  readonly approval: ReturnType<typeof buildSingleFileUpdatePatchApprovalContract>;
} {
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
  return { dryRunResult, approval };
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

function expectBaseEvidence(
  baseEvidence: DryRunResult["baseEvidence"],
): BaseEvidence {
  if (!baseEvidence) {
    throw new Error("Expected dry-run base evidence");
  }
  return baseEvidence;
}

function staleReadPrecondition() {
  return {
    required: true,
    phase: "write-decision-dry-run" as const,
    requiredBefore: "write-decision" as const,
    blocksWriteOn: ["stale-read", "target-missing"] as const,
  };
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

function expectNoWriteContract(contract: PermissionUxContract): void {
  expect(contract.approvalReady).toBe(false);
  expect(contract.writeIntent).toEqual({ authorized: false, count: 0 });
  expect(contract.willWrite).toBe(false);
  expect(contract.changedFiles).toEqual([]);
  expect(contract.writeIntents).toEqual([]);
  expect(contract.noWriterInvoked).toBe(true);
  expect(contract.doesNotClaimProductionWriteReady).toBe(true);
  expect(contract.permissionDecision).toMatch(/^(pending|denied|blocked)$/);
  expect(contract.permissionDecision).not.toBe("approved");
  expect(contract.evidence).toEqual(
    expect.arrayContaining([
      "apply-patch-permission-ux:contract-only",
      "apply-patch-permission-ux:will-write-false",
      "apply-patch-permission-ux:changed-files-empty",
      "apply-patch-permission-ux:write-intents-empty",
      "apply-patch-permission-ux:no-writer-invoked",
      "apply-patch-permission-ux:not-production-write-ready",
      "apply-patch-permission-ux:requested-approved-not-write-authorization",
    ]),
  );
  expect(contract.evidence).not.toContain("write-success");
  expect(contract.evidence).not.toContain("production-write-ready");
}
