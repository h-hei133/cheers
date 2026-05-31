import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applySingleFileReplacePatch,
  type SingleFileReplacePatchResult,
} from "../../../orchestration/patchMutationLane.js";
import {
  buildNoWriteRuntimeRoute,
  type NoWriteRuntimeRoute,
} from "./noWrite.js";

const workspaceRoot = path.resolve("D:/workspace/project");
const rawPatchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-old",
  "+new",
  "*** End Patch",
].join("\n");

describe("apply_patch no-write runtime route", () => {
  it("keeps non-opt-in production runtime input rejected before reads or writes", () => {
    const route = buildNoWriteRuntimeRoute({
      workspaceRoot,
      rawPatchText,
      runtimeSource: "production-adjacent",
      readFile: () => {
        throw new Error("readFile must not run without runtime opt-in");
      },
    });

    expect(route.status).toBe("rejected");
    expect(route.routeStatus).toBe("rejected");
    expect(route.displayStatus).toBe("rejected");
    expect(route.explicitRuntimeOptIn).toBe(false);
    expect(route.doesNotChangeDefaultProductionRejection).toBe(true);
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-no-write-runtime-route:explicit-opt-in-missing",
        "apply-patch-no-write-runtime-route:default-production-rejection-unchanged",
      ]),
    );
    expectNoWriteNoLeak(route);
  });

  it("projects explicit runtime opt-in to permission-pending without writer reachability", () => {
    const route = runtimeRoute("pending");

    expect(route.status).toBe("permission-pending");
    expect(route.routeStatus).toBe("permission-pending");
    expect(route.displayStatus).toBe("permission-pending");
    expect(route.permissionStatus).toBe("pending");
    expect(route.explicitRuntimeOptIn).toBe(true);
    expect(route.targetPath).toBe("src/app.ts");
    expect(route.previewSummary).toContain("M src/app.ts");
    expect(route.displayLines).toContain(
      "Waiting for explicit edit permission; no file was modified.",
    );
    expectNoWriteNoLeak(route);
  });

  it("keeps requested approval as no-write permission UX instead of write authorization", () => {
    const route = runtimeRoute("approved");

    expect(route.status).toBe("permission-pending");
    expect(route.permissionStatus).toBe("pending");
    expect(route.approvalDoesNotAuthorizeWrite).toBe(true);
    expect(route.safetyProof.noApprovalAsWriteAuthorization).toBe(true);
    expect(route.terminalClassification).toBe("stopped");
    expectNoWriteNoLeak(route);
  });

  it("projects denied permission as stopped no-write output", () => {
    const route = runtimeRoute("denied");

    expect(route.status).toBe("denied");
    expect(route.permissionStatus).toBe("denied");
    expect(route.displayLines).toContain("Permission denied; no file was modified.");
    expect(route.nextAction).toContain("Do not write");
    expectNoWriteNoLeak(route);
  });

  it("projects stale-read conflicts as blocked no-write output", () => {
    let reads = 0;
    const route = buildNoWriteRuntimeRoute({
      workspaceRoot,
      rawPatchText,
      explicitRuntimeOptIn: true,
      requestedUserDecision: "approved",
      runtimeSource: "synthetic",
      readFile: () => {
        reads += 1;
        return reads === 1 ? "old\n" : "changed\n";
      },
    });

    expect(route.status).toBe("blocked");
    expect(route.permissionStatus).toBe("blocked");
    expect(route.routeStatus).toBe("blocked");
    expect(route.terminalClassification).toBe("stopped");
    expectNoWriteNoLeak(route);
  });

  it("preserves default replace lane rejection for apply_patch and unified diff", () => {
    const applyPatchResult = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "old\n",
      replaceDirective: {
        from: rawPatchText,
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

function runtimeRoute(
  requestedUserDecision: "pending" | "denied" | "approved",
): NoWriteRuntimeRoute {
  return buildNoWriteRuntimeRoute({
    workspaceRoot,
    rawPatchText,
    explicitRuntimeOptIn: true,
    requestedUserDecision,
    runtimeSource: "synthetic",
    readFile: (absolutePath) => {
      expect(path.relative(workspaceRoot, absolutePath)).toBe("src/app.ts");
      return "old\n";
    },
  });
}

function expectNoWriteNoLeak(route: NoWriteRuntimeRoute): void {
  expect(route.willWrite).toBe(false);
  expect(route.changedFiles).toEqual([]);
  expect(route.writeIntents).toEqual([]);
  expect(route.noWriterInvoked).toBe(true);
  expect(route.noAppliedPatchRecord).toBe(true);
  expect(route.doesNotClaimMutationSuccess).toBe(true);
  expect(route.doesNotClaimWriteSuccess).toBe(true);
  expect(route.terminalClassification).toBe("stopped");
  expect(route.rawProviderMetadataAccepted).toBe(false);
  expect(route.rawApprovalMetadataAccepted).toBe(false);
  expect(route.rawBaseContentAccepted).toBe(false);
  expect(route.rawWriterBoundaryAccepted).toBe(false);
  expect(route.safetyProof).toEqual(
    expect.objectContaining({
      noWriteAuthorization: true,
      noApprovalAsWriteAuthorization: true,
      noChangedFiles: true,
      noWriteIntents: true,
      noWriterInvocation: true,
      noAppliedPatch: true,
      noSuccessClaim: true,
      defaultProductionRejectionUnchanged: true,
      safeProjectionOnly: true,
    }),
  );
  const serialized = JSON.stringify(route).toLowerCase();
  expect(serialized).not.toContain("/home/wang/.private-agents-real");
  expect(serialized).not.toContain('"basecontent":');
  expect(serialized).not.toContain("old\n");
  expect(serialized).not.toContain("write-success\":true");
  expect(serialized).not.toContain("mutation-success\":true");
  expect(serialized).not.toContain("production-write-ready\":true");
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
