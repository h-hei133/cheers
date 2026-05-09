import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applySingleFileReplacePatch,
  type SingleFileReplacePatchResult,
} from "../patchMutationLane.js";
import { buildSingleFileApplyPatchOptInDryRunRoute } from "./singleFileApplyPatchOptInDryRunRoute.js";

const workspaceRoot = path.resolve("D:/workspace/project");
const applyPatchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-old",
  "+new",
  "*** End Patch",
].join("\n");

describe("single-file apply_patch opt-in dry-run route seam", () => {
  it("rejects non-opt-in route usage without entering dry-run or changing production rejection", () => {
    const result = buildSingleFileApplyPatchOptInDryRunRoute({
      workspaceRoot,
      rawPatchText: applyPatchText,
      dryRun: true,
      readFile: () => {
        throw new Error("readFile must not be called without explicit opt-in");
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.explicitOptIn).toBe(false);
    expect(result.willWrite).toBe(false);
    expect(result.changedFiles).toEqual([]);
    expect(result.writeIntents).toEqual([]);
    expect(result.noWriterInvoked).toBe(true);
    expect(result.noAppliedPatchRecord).toBe(true);
    expect(result.doesNotClaimMutationSuccess).toBe(true);
    expect(result.doesNotChangeDefaultProductionRejection).toBe(true);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "single-file-apply-patch-opt-in-dry-run-route:explicit-opt-in-missing",
        "single-file-apply-patch-opt-in-dry-run-route:default-production-rejection-unchanged",
      ]),
    );
  });

  it("routes explicit opt-in dry-run through safe result/session seams with no write", () => {
    const result = optInRoute({ "src/app.ts": "old\n" });

    expect(result.status).toBe("permission-pending");
    expect(result.explicitOptIn).toBe(true);
    expect(result.dryRun.status).toBe("dry-run-ready");
    expect(result.staleRead?.status).toBe("contract-ready");
    expect(result.permissionUx.permissionDecision).toBe("pending");
    expect(result.terminalSurface.status).toBe("permission-pending");
    expect(result.runtimeBridge.status).toBe("permission-pending");
    expect(result.resultMapperSeam.status).toBe("permission-pending");
    expect(result.sessionRuntimeSeam.displayStatus).toBe("permission-pending");
    expectNoWriteNoSuccess(result);
  });

  it("keeps requested approval as a pending permission signal, not write authorization", () => {
    const result = optInRoute(
      { "src/app.ts": "old\n" },
      { requestedUserDecision: "approved" },
    );

    expect(result.status).toBe("permission-pending");
    expect(result.permissionUx.requestedUserDecision).toBe("approved");
    expect(result.permissionUx.approvalTokenPrepared).toBe(true);
    expect(result.permissionUx.approvalReady).toBe(false);
    expect(result.permissionUx.writeIntent).toEqual({ authorized: false, count: 0 });
    expect(result.terminalSurface.approval.decision).toBe("pending");
    expectNoWriteNoSuccess(result);
  });

  it("surfaces stale-read as blocked before writer reachability", () => {
    let reads = 0;
    const result = buildSingleFileApplyPatchOptInDryRunRoute({
      workspaceRoot,
      rawPatchText: applyPatchText,
      dryRun: true,
      explicitOptIn: true,
      readFile: (absolutePath) => {
        expect(path.relative(workspaceRoot, absolutePath)).toBe("src/app.ts");
        reads += 1;
        return reads === 1 ? "old\n" : "changed\n";
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.explicitOptIn).toBe(true);
    expect(result.staleRead?.blocker).toBe("stale-read");
    expect(result.terminalSurface.status).toBe("blocked");
    expect(result.resultMapperSeam.status).toBe("blocked");
    expect(result.sessionRuntimeSeam.displayStatus).toBe("blocked");
    expect(result.nextAction).toContain("Re-read");
    expectNoWriteNoSuccess(result);
  });

  it("keeps unsupported apply_patch shapes no-write under opt-in dry-run", () => {
    const result = buildSingleFileApplyPatchOptInDryRunRoute({
      workspaceRoot,
      rawPatchText: [
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+new",
        "*** End Patch",
      ].join("\n"),
      dryRun: true,
      explicitOptIn: true,
      readFile: () => undefined,
    });

    expect(result.status).toBe("blocked");
    expect(result.explicitOptIn).toBe(true);
    expect(result.dryRun.status).toBe("blocked");
    expect(result.dryRun.failedFiles[0]?.code).toBe("patch-add-file-not-enabled");
    expect(result.dryRun.unsupportedCapability?.blockedReason).toBe(
      "add-file-not-enabled",
    );
    expect(result.terminalSurface.status).toBe("blocked");
    expectNoWriteNoSuccess(result);
  });

  it("preserves default replace lane rejection for production apply_patch and unified diff payloads", () => {
    const applyPatchResult = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "old\n",
      replaceDirective: {
        from: applyPatchText,
        to: "",
      },
    });
    const unifiedDiffResult = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "old\n",
      replaceDirective: {
        from: [
          "diff --git a/src/app.ts b/src/app.ts",
          "--- a/src/app.ts",
          "+++ b/src/app.ts",
          "@@ -1 +1 @@",
          "-old",
          "+new",
        ].join("\n"),
        to: "",
      },
    });

    expect(asReplaceFailure(applyPatchResult).failureCode).toBe(
      "patch-generation-failed",
    );
    expect(asReplaceFailure(unifiedDiffResult).failureCode).toBe(
      "patch-generation-failed",
    );
  });
});

function optInRoute(
  files: Readonly<Record<string, string>>,
  options: { readonly requestedUserDecision?: "approved" } = {},
): Extract<
  ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
  { explicitOptIn: true }
> {
  const result = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot,
    rawPatchText: applyPatchText,
    dryRun: true,
    explicitOptIn: true,
    readFile: (absolutePath) => files[path.relative(workspaceRoot, absolutePath)],
    ...options,
  });
  if (result.explicitOptIn !== true) {
    throw new Error("Expected opt-in route result");
  }
  return result;
}

function expectNoWriteNoSuccess(
  result: Extract<
    ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
    { explicitOptIn: true }
  >,
): void {
  expect(result.willWrite).toBe(false);
  expect(result.changedFiles).toEqual([]);
  expect(result.writeIntents).toEqual([]);
  expect(result.noWriterInvoked).toBe(true);
  expect(result.noAppliedPatchRecord).toBe(true);
  expect(result.doesNotClaimMutationSuccess).toBe(true);
  expect(result.doesNotClaimWriteSuccess).toBe(true);
  expect(result.dryRun.changedFiles).toEqual([]);
  expect(result.dryRun.writeIntents).toEqual([]);
  expect(result.dryRun.noWriterInvoked).toBe(true);
  expect(result.terminalSurface.changedFiles).toEqual([]);
  expect(result.terminalSurface.writeIntents).toEqual([]);
  expect(result.runtimeBridge.changedFiles).toEqual([]);
  expect(result.runtimeBridge.writeIntents).toEqual([]);
  expect(result.resultMapperSeam.changedFiles).toEqual([]);
  expect(result.resultMapperSeam.writeIntents).toEqual([]);
  expect(result.resultMapperSeam.terminalClassification).not.toBe("success");
  expect(result.resultMapperSeam.patchesApplied).toBe(false);
  expect(result.resultMapperSeam.verificationPassed).toBe(false);
  expect(result.resultMapperSeam.taskSatisfied).toBe(false);
  expect(result.sessionRuntimeSeam.changedDisplay).toBe("none");
  expect(result.sessionRuntimeSeam.mutationSuccessDisplayed).toBe(false);
  expect(result.sessionRuntimeSeam.writeSuccessDisplayed).toBe(false);
  expect(result.sessionRuntimeSeam.appliedPatchDisplayed).toBe(false);
  const serialized = JSON.stringify(result).toLowerCase();
  expect(serialized).not.toContain('"basecontent":');
  expect(serialized).not.toContain("write-success\":true");
  expect(serialized).not.toContain("mutation-success\":true");
  expect(serialized).not.toContain("production-write-ready\":true");
  expect(serialized).not.toContain("productionwritereadydisplayed\":true");
  expect(serialized).not.toContain("\"applied\"");
}

function asReplaceFailure(
  result: SingleFileReplacePatchResult,
): Extract<SingleFileReplacePatchResult, { ok: false }> {
  if (result.ok) {
    throw new Error("Expected replace patch failure");
  }
  return result as Extract<SingleFileReplacePatchResult, { ok: false }>;
}
