import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applySingleFileReplacePatch,
  type SingleFileReplacePatchResult,
} from "../patchMutationLane.js";
import { buildSingleFileApplyPatchOptInDryRunRoute } from "./singleFileApplyPatchOptInDryRunRoute.js";
import { buildWriteDecisionGate } from "./writeDecisionGate.js";
import {
  buildGuardedWriteGate,
  type GuardedWriteGate,
} from "./guardedWriteGate.js";

const workspaceRoot = path.resolve("D:/workspace/guarded-write");
const applyPatchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-status: draft",
  "+status: ready",
  "*** End Patch",
].join("\n");

describe("single-file apply_patch guarded write gate", () => {
  it("blocks without explicit opt-in even when prompt text asks to write", () => {
    const writeDecision = buildWriteDecisionGate({
      permissionUx: approvedRoute().permissionUx,
      explicitApprovedForWrite: true,
    });
    const gate = buildGuardedWriteGate({
      explicitOptIn: false,
      writeDecision,
      singleFileUpdateOnly: true,
      defaultProductionRejectionUnchanged: true,
      promptText: "approved, write it now",
    });

    expect(gate.status).toBe("blocked");
    expect(gate.blocker).toBe("explicit-opt-in-missing");
    expect(gate.promptApprovalIgnored).toBe(true);
    expectNoWriteGateLeak(gate);
  });

  it("blocks pending, denied, and blocked write decisions", () => {
    for (const writeDecision of [
      buildWriteDecisionGate({
        permissionUx: approvedRoute().permissionUx,
        explicitApprovedForWrite: false,
      }),
      buildWriteDecisionGate({
        permissionUx: deniedRoute().permissionUx,
        explicitApprovedForWrite: true,
      }),
      buildWriteDecisionGate({
        permissionUx: blockedRoute().permissionUx,
        explicitApprovedForWrite: true,
      }),
    ]) {
      const gate = buildGuardedWriteGate({
        explicitOptIn: true,
        writeDecision,
        singleFileUpdateOnly: true,
        defaultProductionRejectionUnchanged: true,
      });

      expect(gate.status).toBe("blocked");
      expect(gate.blocker).toBe("write-decision-not-approved");
      expectNoWriteGateLeak(gate);
    }
  });

  it("requires single-file Update File and unchanged default rejection", () => {
    const writeDecision = buildWriteDecisionGate({
      permissionUx: approvedRoute().permissionUx,
      explicitApprovedForWrite: true,
    });
    const unsupported = buildGuardedWriteGate({
      explicitOptIn: true,
      writeDecision,
      singleFileUpdateOnly: false,
      defaultProductionRejectionUnchanged: true,
    });
    const defaultRegression = buildGuardedWriteGate({
      explicitOptIn: true,
      writeDecision,
      singleFileUpdateOnly: true,
      defaultProductionRejectionUnchanged: false,
    });

    expect(unsupported.status).toBe("blocked");
    expect(unsupported.blocker).toBe("unsupported-operation");
    expect(defaultRegression.status).toBe("blocked");
    expect(defaultRegression.blocker).toBe("default-rejection-regression");
    expectNoWriteGateLeak(unsupported);
    expectNoWriteGateLeak(defaultRegression);
  });

  it("becomes ready only for explicit opt-in plus approved-for-write preconditions", () => {
    const writeDecision = buildWriteDecisionGate({
      permissionUx: approvedRoute().permissionUx,
      explicitApprovedForWrite: true,
    });
    const gate = buildGuardedWriteGate({
      explicitOptIn: true,
      writeDecision,
      singleFileUpdateOnly: true,
      defaultProductionRejectionUnchanged: true,
    });

    expect(gate.status).toBe("ready");
    expect(gate.writeDecisionStatus).toBe("approved-for-write");
    expect(gate.finalStaleReadRequiredAfterApproval).toBe(true);
    expect(gate.writerBoundaryRequired).toBe(true);
    expect(gate.nextAction).toContain("final stale-read");
    expectNoWriteGateLeak(gate);
  });

  it("preserves default production apply_patch and unified diff rejection", () => {
    expect(asReplaceFailure(defaultApplyPatchResult()).failureCode).toBe(
      "patch-generation-failed",
    );
    expect(asReplaceFailure(defaultUnifiedDiffResult()).failureCode).toBe(
      "patch-generation-failed",
    );
  });
});

function approvedRoute(): Extract<
  ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
  { explicitOptIn: true }
> {
  const route = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot,
    rawPatchText: applyPatchText,
    dryRun: true,
    explicitOptIn: true,
    requestedUserDecision: "approved",
    readFile: (absolutePath) => {
      expect(path.relative(workspaceRoot, absolutePath)).toBe("src/app.ts");
      return "status: draft\nowner: guarded\n";
    },
  });
  if (route.explicitOptIn !== true) {
    throw new Error("Expected explicit opt-in route");
  }
  return route;
}

function deniedRoute(): Extract<
  ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
  { explicitOptIn: true }
> {
  const route = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot,
    rawPatchText: applyPatchText,
    dryRun: true,
    explicitOptIn: true,
    requestedUserDecision: "denied",
    readFile: () => "status: draft\nowner: guarded\n",
  });
  if (route.explicitOptIn !== true) {
    throw new Error("Expected explicit opt-in route");
  }
  return route;
}

function blockedRoute(): Extract<
  ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
  { explicitOptIn: true }
> {
  const route = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot,
    rawPatchText: [
      "*** Begin Patch",
      "*** Add File: src/new.ts",
      "+new",
      "*** End Patch",
    ].join("\n"),
    dryRun: true,
    explicitOptIn: true,
    requestedUserDecision: "approved",
    readFile: () => undefined,
  });
  if (route.explicitOptIn !== true) {
    throw new Error("Expected explicit opt-in route");
  }
  return route;
}

function defaultApplyPatchResult(): SingleFileReplacePatchResult {
  return applySingleFileReplacePatch({
    targetPath: "src/app.ts",
    originalContent: "status: draft\nowner: guarded\n",
    replaceDirective: {
      from: applyPatchText,
      to: "",
    },
  });
}

function defaultUnifiedDiffResult(): SingleFileReplacePatchResult {
  return applySingleFileReplacePatch({
    targetPath: "src/app.ts",
    originalContent: "status: draft\nowner: guarded\n",
    replaceDirective: {
      from: [
        "diff --git a/src/app.ts b/src/app.ts",
        "--- a/src/app.ts",
        "+++ b/src/app.ts",
        "@@ -1 +1 @@",
        "-status: draft",
        "+status: ready",
      ].join("\n"),
      to: "",
    },
  });
}

function asReplaceFailure(
  result: SingleFileReplacePatchResult,
): Extract<SingleFileReplacePatchResult, { ok: false }> {
  if (result.ok) {
    throw new Error("Expected replace patch failure");
  }
  return result as Extract<SingleFileReplacePatchResult, { ok: false }>;
}

function expectNoWriteGateLeak(gate: GuardedWriteGate): void {
  expect(gate.willWrite).toBe(false);
  expect(gate.changedFiles).toEqual([]);
  expect(gate.writeIntents).toEqual([]);
  expect(gate.noWriterInvoked).toBe(true);
  expect(gate.noAppliedPatchRecord).toBe(true);
  expect(gate.doesNotClaimMutationSuccess).toBe(true);
  expect(gate.doesNotClaimWriteSuccess).toBe(true);
  expect(gate.approvalMetadataDoesNotAuthorizeWrite).toBe(true);
  expect(gate.dryRunDoesNotAuthorizeWrite).toBe(true);
  expect(gate.evidence).toEqual(
    expect.arrayContaining([
      "apply-patch-guarded-write-gate:contract",
      "apply-patch-guarded-write-gate:explicit-opt-in-required",
      "apply-patch-guarded-write-gate:approved-for-write-required",
      "apply-patch-guarded-write-gate:final-stale-read-required-after-approval",
      "apply-patch-guarded-write-gate:writer-boundary-required",
      "apply-patch-guarded-write-gate:no-prompt-keyword-approval",
      "apply-patch-guarded-write-gate:approval-metadata-not-write-authorization",
      "apply-patch-guarded-write-gate:dry-run-not-write-authorization",
      "apply-patch-guarded-write-gate:changed-files-empty",
      "apply-patch-guarded-write-gate:write-intents-empty",
      "apply-patch-guarded-write-gate:no-writer-invoked",
      "apply-patch-guarded-write-gate:no-applied-patch-record",
      "apply-patch-guarded-write-gate:no-success-claim",
    ]),
  );
  expect(JSON.stringify(gate).toLowerCase()).not.toContain("write-success");
}
