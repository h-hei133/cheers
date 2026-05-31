import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildNoPartialPatchApplicationContract } from "../../../orchestration/patchApplication/noPartialApply.js";
import {
  applySingleFileReplacePatch,
  type SingleFileReplacePatchResult,
} from "../../../orchestration/patchMutationLane.js";
import { parseApplyPatchText } from "../../../orchestration/patchParsing/parser.js";
import type {
  ParsedPatch,
  PatchVerificationResult,
} from "../../../orchestration/patchParsing/types.js";
import { verifyParsedPatch } from "../../../orchestration/patchVerification/verify.js";
import { buildSingleFileApplyPatchBaseEvidence } from "../../../evidence/projection/patch/base.js";
import { buildPatchPreview } from "../../patch/result/preview.js";
import {
  buildSingleFileUpdatePatchApprovalContract,
  buildSingleFileUpdatePatchResultSurfaceContract,
} from "./production.js";
import {
  buildSingleFileUpdatePatchReadinessContract,
  type SingleFileUpdatePatchReadinessContract,
} from "../../patch/status/readiness.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("single-file Update File apply_patch production gate contract", () => {
  it("builds audit-safe approval metadata for valid readiness without authorizing writes", () => {
    const readiness = buildReadiness(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      {
        "src/app.ts": "old\n",
      },
    );

    const approval = buildSingleFileUpdatePatchApprovalContract(readiness);

    expect(readiness.ready).toBe(true);
    expect(approval).toEqual({
      capability: "single-file-update-apply-patch-production-gate",
      permissionKind: "edit",
      operationKind: "update",
      targetPath: "src/app.ts",
      patterns: ["src/app.ts"],
      decision: "pending",
      metadata: {
        auditSafe: true,
        filepath: "src/app.ts",
        diff: expect.stringContaining("willWrite=false"),
        previewSummary: ["M src/app.ts"],
        files: [
          {
            path: "src/app.ts",
            operationKind: "update",
            summary: "M src/app.ts",
            additions: 1,
            deletions: 1,
          },
        ],
        additions: 1,
        deletions: 1,
        singleFileOnly: true,
        unsupportedOperations: ["multi-file", "add", "delete", "move"],
        willWrite: false,
      },
      writeIntent: {
        authorized: false,
        count: 0,
      },
      nextAction: expect.stringContaining("Request explicit edit approval"),
    });
  });

  it("binds approval metadata to base evidence and stale-read precondition without authorizing writes", () => {
    const readiness = buildReadiness(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      {
        "src/app.ts": "old\n",
      },
    );
    const baseEvidence = buildSingleFileApplyPatchBaseEvidence({
      targetPath: "src/app.ts",
      baseContent: "old\n",
    });

    const approval = buildSingleFileUpdatePatchApprovalContract(readiness, {
      baseEvidence,
      decision: "approved",
    });

    expect(approval.decision).toBe("pending");
    expect(approval.writeIntent).toEqual({ authorized: false, count: 0 });
    expect(approval.metadata.baseEvidence).toEqual(baseEvidence);
    expect(approval.metadata.staleReadPrecondition).toEqual({
      required: true,
      phase: "write-decision-dry-run",
      requiredBefore: "write-decision",
      blocksWriteOn: ["stale-read", "target-missing"],
    });
    expect(
      Object.prototype.hasOwnProperty.call(
        approval.metadata.baseEvidence,
        "baseContent",
      ),
    ).toBe(false);
  });

  it("builds result/session surface shape for valid readiness without production wiring", () => {
    const readiness = buildReadiness(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      {
        "src/app.ts": "old\n",
      },
    );
    const approval = buildSingleFileUpdatePatchApprovalContract(readiness, {
      decision: "approved",
    });

    const surface = buildSingleFileUpdatePatchResultSurfaceContract({
      readiness,
      approval,
    });

    expect(surface).toEqual({
      status: "ready",
      changedFiles: ["src/app.ts"],
      failedFiles: [],
      patches: [
        {
          path: "src/app.ts",
          operation: "update",
          status: "previewed",
          additions: 1,
          deletions: 1,
        },
      ],
      evidence: expect.arrayContaining([
        "apply-patch-readiness:single-file-update",
        "apply-patch-production-gate:approval-metadata-ready",
        "apply-patch-production-gate:result-surface-ready",
        "apply-patch-production-gate:no-production-wiring",
      ]),
      nextAction: expect.stringContaining("Keep production apply_patch rejected"),
      doNext: expect.stringContaining("dry-run production gate"),
      noWriteProof: {
        willWrite: false,
        writeIntentCount: 1,
        blockedWrites: false,
        reason: "Contract-only production gate; no disk write is performed.",
      },
    });
  });

  it("keeps approval denied as no-write with no changed files and actionable next action", () => {
    const readiness = buildReadiness(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      {
        "src/app.ts": "old\n",
      },
    );
    const approval = buildSingleFileUpdatePatchApprovalContract(readiness, {
      decision: "denied",
    });

    const surface = buildSingleFileUpdatePatchResultSurfaceContract({
      readiness,
      approval,
    });

    expect(approval.writeIntent).toEqual({ authorized: false, count: 0 });
    expect(surface.status).toBe("blocked");
    expect(surface.changedFiles).toEqual([]);
    expect(surface.failureCategory).toBe("approval-denied");
    expect(surface.blocker).toBe("approval-denied");
    expect(surface.nextAction).toContain("approve");
    expect(surface.noWriteProof).toEqual({
      willWrite: false,
      writeIntentCount: 0,
      blockedWrites: true,
      reason: "Approval denied for single-file Update File patch.",
    });
  });

  it("keeps unsupported multi-file patches blocked before write intent authorization", () => {
    const readiness = buildReadiness(
      [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: src/b.ts",
        "@@",
        "-b",
        "+bb",
        "*** End Patch",
      ],
      {
        "src/a.ts": "a\n",
        "src/b.ts": "b\n",
      },
    );

    const approval = buildSingleFileUpdatePatchApprovalContract(readiness);
    const surface = buildSingleFileUpdatePatchResultSurfaceContract({
      readiness,
      approval,
    });

    expect(readiness.ready).toBe(false);
    expect(approval.decision).toBe("blocked");
    expect(approval.writeIntent).toEqual({ authorized: false, count: 0 });
    expect(surface.status).toBe("blocked");
    expect(surface.changedFiles).toEqual([]);
    expect(surface.failureCategory).toBe("unsupported-patch-shape");
    expect(surface.noWriteProof.writeIntentCount).toBe(0);
    expect(surface.noWriteProof.blockedWrites).toBe(true);
  });

  it.each([
    {
      name: "add",
      lines: [
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+new",
        "*** End Patch",
      ],
      files: {},
    },
    {
      name: "delete",
      lines: [
        "*** Begin Patch",
        "*** Delete File: src/remove.ts",
        "*** End Patch",
      ],
      files: {
        "src/remove.ts": "remove\n",
      },
    },
    {
      name: "move",
      lines: [
        "*** Begin Patch",
        "*** Update File: src/from.ts",
        "*** Move to: src/to.ts",
        "@@",
        "-from",
        "+to",
        "*** End Patch",
      ],
      files: {
        "src/from.ts": "from\n",
      },
    },
  ])("keeps unsupported $name patches blocked with no write intent", ({ lines, files }) => {
    const readiness = buildReadiness(lines, files);

    const approval = buildSingleFileUpdatePatchApprovalContract(readiness);
    const surface = buildSingleFileUpdatePatchResultSurfaceContract({
      readiness,
      approval,
    });

    expect(readiness.ready).toBe(false);
    expect(approval.decision).toBe("blocked");
    expect(approval.metadata.unsupportedOperations).toEqual([
      "multi-file",
      "add",
      "delete",
      "move",
    ]);
    expect(approval.writeIntent).toEqual({ authorized: false, count: 0 });
    expect(surface.changedFiles).toEqual([]);
    expect(surface.failureCategory).toBe("unsupported-patch-shape");
    expect(surface.noWriteProof).toEqual(
      expect.objectContaining({
        willWrite: false,
        writeIntentCount: 0,
        blockedWrites: true,
      }),
    );
  });

  it("keeps production apply_patch and unified diff inputs rejected in the current replace lane", () => {
    const applyPatchResult = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "const value = 1;\n",
      replaceDirective: {
        from: [
          "*** Begin Patch",
          "*** Update File: src/app.ts",
          "@@",
          "-const value = 1;",
          "+const value = 2;",
          "*** End Patch",
        ].join("\n"),
        to: "",
      },
    });
    const unifiedDiffResult = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "const value = 1;\n",
      replaceDirective: {
        from: [
          "diff --git a/src/app.ts b/src/app.ts",
          "--- a/src/app.ts",
          "+++ b/src/app.ts",
          "@@ -1 +1 @@",
          "-const value = 1;",
          "+const value = 2;",
        ].join("\n"),
        to: "",
      },
    });

    if (applyPatchResult.ok) {
      throw new Error("apply_patch-shaped input should remain rejected");
    }
    expect(asReplaceFailure(applyPatchResult).failureCode).toBe(
      "patch-generation-failed",
    );
    if (unifiedDiffResult.ok) {
      throw new Error("unified diff input should remain rejected");
    }
    expect(asReplaceFailure(unifiedDiffResult).failureCode).toBe(
      "patch-generation-failed",
    );
  });
});

function buildReadiness(
  lines: readonly string[],
  files: Readonly<Record<string, string>>,
): SingleFileUpdatePatchReadinessContract {
  const verification = verifyPatch(lines, files);
  return buildSingleFileUpdatePatchReadinessContract({
    verification,
    preview: buildPatchPreview(verification),
    applicationContract: buildNoPartialPatchApplicationContract(verification),
  });
}

function verifyPatch(
  lines: readonly string[],
  files: Readonly<Record<string, string>>,
): PatchVerificationResult {
  return verifyParsedPatch(parsePatch(lines), {
    workspaceRoot,
    readFile: (absolutePath) => files[path.relative(workspaceRoot, absolutePath)],
  });
}

function parsePatch(lines: readonly string[]): ParsedPatch {
  const parsed = parseApplyPatchText(lines.join("\n"));
  if (parsed.ok) {
    return parsed.patch;
  }
  throw new Error(
    (parsed as Extract<ReturnType<typeof parseApplyPatchText>, { ok: false }>)
      .failure.message,
  );
}

function asReplaceFailure(
  result: SingleFileReplacePatchResult,
): Extract<SingleFileReplacePatchResult, { ok: false }> {
  if (result.ok) {
    throw new Error("Expected replace patch failure");
  }
  return result as Extract<SingleFileReplacePatchResult, { ok: false }>;
}
