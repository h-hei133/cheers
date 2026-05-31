import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applySingleFileReplacePatch,
  type SingleFileReplacePatchResult,
} from "../patchMutationLane.js";
import { buildGuardedWriteGate } from "./guardedWriteGate.js";
import { buildSingleFileApplyPatchOptInDryRunRoute } from "./singleFileApplyPatchOptInDryRunRoute.js";
import { buildWriteDecisionGate } from "../../edit/authority/approval/decision.js";
import {
  buildRouteWiringGate,
  type RouteWiringGate,
} from "./routeWiringGate.js";

const workspaceRoot = path.resolve("D:/workspace/route-wiring");
const applyPatchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-status: draft",
  "+status: ready",
  "*** End Patch",
].join("\n");

describe("single-file apply_patch route wiring gate", () => {
  it("blocks without explicit route opt-in even when prompt text asks to write", () => {
    const gate = buildRouteWiringGate({
      explicitRouteOptIn: false,
      guardedGate: readyGuardedGate(),
      singleFileUpdateOnly: true,
      defaultProductionRejectionUnchanged: true,
      safeResultSessionProjection: true,
      promptText: "approved, write the apply_patch now",
    });

    expect(gate.status).toBe("blocked");
    expect(gate.blocker).toBe("explicit-route-opt-in-missing");
    expect(gate.promptApprovalIgnored).toBe(true);
    expectNoRouteWriteLeak(gate);
  });

  it("blocks when the guarded write gate is not ready", () => {
    const writeDecision = buildWriteDecisionGate({
      permissionUx: approvedRoute().permissionUx,
      explicitApprovedForWrite: false,
    });
    const guardedGate = buildGuardedWriteGate({
      explicitOptIn: true,
      writeDecision,
      singleFileUpdateOnly: true,
      defaultProductionRejectionUnchanged: true,
    });

    const gate = buildRouteWiringGate({
      explicitRouteOptIn: true,
      guardedGate,
      singleFileUpdateOnly: true,
      defaultProductionRejectionUnchanged: true,
      safeResultSessionProjection: true,
    });

    expect(gate.status).toBe("blocked");
    expect(gate.blocker).toBe("guarded-gate-not-ready");
    expect(gate.guardedGateBlocker).toBe("write-decision-not-approved");
    expectNoRouteWriteLeak(gate);
  });

  it("blocks unsupported operations, default rejection regression, and unsafe projections", () => {
    const cases = [
      buildRouteWiringGate({
        explicitRouteOptIn: true,
        guardedGate: readyGuardedGate(),
        singleFileUpdateOnly: false,
        defaultProductionRejectionUnchanged: true,
        safeResultSessionProjection: true,
      }),
      buildRouteWiringGate({
        explicitRouteOptIn: true,
        guardedGate: readyGuardedGate(),
        singleFileUpdateOnly: true,
        defaultProductionRejectionUnchanged: false,
        safeResultSessionProjection: true,
      }),
      buildRouteWiringGate({
        explicitRouteOptIn: true,
        guardedGate: readyGuardedGate(),
        singleFileUpdateOnly: true,
        defaultProductionRejectionUnchanged: true,
        safeResultSessionProjection: false,
      }),
    ];

    expect(cases.map((item) => item.blocker)).toEqual([
      "unsupported-operation",
      "default-rejection-regression",
      "safe-result-session-projection-missing",
    ]);
    for (const gate of cases) {
      expect(gate.status).toBe("blocked");
      expectNoRouteWriteLeak(gate);
    }
  });

  it("becomes ready only after explicit route opt-in and guarded preconditions", () => {
    const gate = buildRouteWiringGate({
      explicitRouteOptIn: true,
      guardedGate: readyGuardedGate(),
      singleFileUpdateOnly: true,
      defaultProductionRejectionUnchanged: true,
      safeResultSessionProjection: true,
    });

    expect(gate.status).toBe("ready");
    expect(gate.guardedGateStatus).toBe("ready");
    expect(gate.targetPath).toBe("src/app.ts");
    expect(gate.finalStaleReadRequiredAfterApproval).toBe(true);
    expect(gate.writerBoundaryRequired).toBe(true);
    expect(gate.nextAction).toContain("final stale-read");
    expectNoRouteWriteLeak(gate);
    expect(gate.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-route-wiring-gate:explicit-route-opt-in-required",
        "apply-patch-route-wiring-gate:safe-result-session-projection",
        "apply-patch-route-wiring-gate:default-production-rejection-unchanged",
      ]),
    );
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

function readyGuardedGate(): ReturnType<typeof buildGuardedWriteGate> {
  const writeDecision = buildWriteDecisionGate({
    permissionUx: approvedRoute().permissionUx,
    explicitApprovedForWrite: true,
  });
  return buildGuardedWriteGate({
    explicitOptIn: true,
    writeDecision,
    singleFileUpdateOnly: true,
    defaultProductionRejectionUnchanged: true,
  });
}

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
      return "status: draft\nowner: route\n";
    },
  });
  if (route.explicitOptIn !== true) {
    throw new Error("Expected explicit opt-in route");
  }
  return route;
}

function defaultApplyPatchResult(): SingleFileReplacePatchResult {
  return applySingleFileReplacePatch({
    targetPath: "src/app.ts",
    originalContent: "status: draft\nowner: route\n",
    replaceDirective: {
      from: applyPatchText,
      to: "",
    },
  });
}

function defaultUnifiedDiffResult(): SingleFileReplacePatchResult {
  return applySingleFileReplacePatch({
    targetPath: "src/app.ts",
    originalContent: "status: draft\nowner: route\n",
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

function expectNoRouteWriteLeak(gate: RouteWiringGate): void {
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
      "apply-patch-route-wiring-gate:will-write-false",
      "apply-patch-route-wiring-gate:changed-files-empty",
      "apply-patch-route-wiring-gate:write-intents-empty",
      "apply-patch-route-wiring-gate:no-writer-invoked",
      "apply-patch-route-wiring-gate:no-applied-patch-record",
      "apply-patch-route-wiring-gate:no-success-claim",
    ]),
  );
  expect(JSON.stringify(gate).toLowerCase()).not.toContain("write-success");
}
