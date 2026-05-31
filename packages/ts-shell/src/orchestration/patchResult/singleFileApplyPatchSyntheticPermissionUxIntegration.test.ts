import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applySingleFileReplacePatch,
  type SingleFileReplacePatchResult,
} from "../patchMutationLane.js";
import { buildSingleFileApplyPatchOptInDryRunRoute } from "../../edit/patch/apply/optIn.js";
import { buildSingleFileApplyPatchPermissionUxRealRouteSeam } from "./singleFileApplyPatchPermissionUxRealRouteSeam.js";

const applyPatchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-status: draft",
  "+status: ready",
  "*** End Patch",
].join("\n");

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("single-file apply_patch synthetic permission UX integration", () => {
  it("carries pending permission through terminal and session safe surfaces without writing", () => {
    const fixture = createSyntheticFixture();
    const before = snapshotFixture(fixture.workspaceRoot);

    const routeResult = buildRoute(fixture.workspaceRoot, "pending");
    const seam = buildSingleFileApplyPatchPermissionUxRealRouteSeam({
      routeResult,
      requestedUserDecision: "pending",
    });

    const after = snapshotFixture(fixture.workspaceRoot);

    expect(routeResult.status).toBe("permission-pending");
    expect(routeResult.terminalSurface.status).toBe("permission-pending");
    expect(routeResult.resultMapperSeam.terminalClassification).toBe("stopped");
    expect(routeResult.sessionRuntimeSeam.displayStatus).toBe("permission-pending");
    expect(seam.permissionStatus).toBe("pending");
    expect(seam.displayLines).toContain(
      "Waiting for explicit edit permission; no file was modified.",
    );
    expectNoWriteNoSuccess(routeResult, seam);
    expect(after).toEqual(before);
  });

  it("carries denied permission through safe surfaces without approved-to-write state", () => {
    const fixture = createSyntheticFixture();
    const before = snapshotFixture(fixture.workspaceRoot);

    const routeResult = buildRoute(fixture.workspaceRoot, "denied");
    const seam = buildSingleFileApplyPatchPermissionUxRealRouteSeam({
      routeResult,
      requestedUserDecision: "denied",
    });

    const after = snapshotFixture(fixture.workspaceRoot);

    expect(routeResult.permissionUx.permissionDecision).toBe("denied");
    expect(routeResult.permissionUx.approvalTokenPrepared).toBe(false);
    expect(routeResult.sessionRuntimeSeam.writeSuccessDisplayed).toBe(false);
    expect(seam.permissionStatus).toBe("denied");
    expect(seam.approvalReady).toBe(false);
    expect(seam.approvalTokenPrepared).toBe(false);
    expect(seam.approvalDoesNotAuthorizeWrite).toBe(true);
    expect(seam.displayLines).toContain("Permission denied; no file was modified.");
    expectNoWriteNoSuccess(routeResult, seam);
    expect(after).toEqual(before);
  });

  it("blocks stale synthetic fixtures before permission can become write-ready", () => {
    const fixture = createSyntheticFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    let reads = 0;

    const routeResult = buildSingleFileApplyPatchOptInDryRunRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      dryRun: true,
      explicitOptIn: true,
      requestedUserDecision: "approved",
      readFile: (absolutePath) => {
        if (!fs.existsSync(absolutePath)) {
          return undefined;
        }
        reads += 1;
        return reads === 1
          ? fs.readFileSync(absolutePath, "utf8")
          : "status: externally changed\nowner: synthetic\n";
      },
    });
    const seam = buildSingleFileApplyPatchPermissionUxRealRouteSeam({
      routeResult,
      requestedUserDecision: "approved",
    });

    const after = snapshotFixture(fixture.workspaceRoot);

    expect(routeResult.status).toBe("blocked");
    expect(routeResult.staleRead?.blocker).toBe("stale-read");
    expect(routeResult.sessionRuntimeSeam.displayStatus).toBe("blocked");
    expect(seam.permissionStatus).toBe("blocked");
    expect(seam.blocker).toBe("permission-ux-blocked");
    expect(seam.approvalTokenPrepared).toBe(false);
    expectNoWriteNoSuccess(routeResult, seam);
    expect(after).toEqual(before);
  });

  it("preserves default production apply_patch and unified diff rejection", () => {
    const applyPatchResult = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "status: draft\nowner: synthetic\n",
      replaceDirective: {
        from: applyPatchText,
        to: "",
      },
    });
    const unifiedDiffResult = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "status: draft\nowner: synthetic\n",
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

    expect(asReplaceFailure(applyPatchResult).failureCode).toBe(
      "patch-generation-failed",
    );
    expect(asReplaceFailure(unifiedDiffResult).failureCode).toBe(
      "patch-generation-failed",
    );
  });
});

function buildRoute(
  workspaceRoot: string,
  requestedUserDecision: "pending" | "denied",
): Extract<
  ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
  { explicitOptIn: true }
> {
  const result = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot,
    rawPatchText: applyPatchText,
    dryRun: true,
    explicitOptIn: true,
    requestedUserDecision,
    readFile: (absolutePath) =>
      fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : undefined,
  });
  if (result.explicitOptIn !== true) {
    throw new Error("Expected opt-in route result");
  }
  return result;
}

function createSyntheticFixture(): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "single-file-apply-patch-permission-ux-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, "src", "app.ts"),
    "status: draft\nowner: synthetic\n",
    "utf8",
  );
  fs.writeFileSync(path.join(workspaceRoot, "LOCKED.md"), "do not modify\n", "utf8");
  return { workspaceRoot };
}

function snapshotFixture(workspaceRoot: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      result[path.relative(workspaceRoot, absolutePath).replace(/\\/g, "/")] =
        fs.readFileSync(absolutePath, "utf8");
    }
  };
  visit(workspaceRoot);
  return result;
}

function expectNoWriteNoSuccess(
  routeResult: Extract<
    ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
    { explicitOptIn: true }
  >,
  seam: ReturnType<typeof buildSingleFileApplyPatchPermissionUxRealRouteSeam>,
): void {
  expect(routeResult.willWrite).toBe(false);
  expect(routeResult.changedFiles).toEqual([]);
  expect(routeResult.writeIntents).toEqual([]);
  expect(routeResult.noWriterInvoked).toBe(true);
  expect(routeResult.noAppliedPatchRecord).toBe(true);
  expect(routeResult.doesNotClaimMutationSuccess).toBe(true);
  expect(routeResult.doesNotClaimWriteSuccess).toBe(true);
  expect(routeResult.dryRun.changedFiles).toEqual([]);
  expect(routeResult.dryRun.writeIntents).toEqual([]);
  expect(routeResult.terminalSurface.changedFiles).toEqual([]);
  expect(routeResult.terminalSurface.writeIntents).toEqual([]);
  expect(routeResult.resultMapperSeam.terminalClassification).not.toBe("success");
  expect(routeResult.resultMapperSeam.changedFiles).toEqual([]);
  expect(routeResult.resultMapperSeam.writeIntents).toEqual([]);
  expect(routeResult.resultMapperSeam.patchesApplied).toBe(false);
  expect(routeResult.resultMapperSeam.taskSatisfied).toBe(false);
  expect(routeResult.sessionRuntimeSeam.changedDisplay).toBe("none");
  expect(routeResult.sessionRuntimeSeam.mutationSuccessDisplayed).toBe(false);
  expect(routeResult.sessionRuntimeSeam.writeSuccessDisplayed).toBe(false);
  expect(routeResult.sessionRuntimeSeam.appliedPatchDisplayed).toBe(false);
  expect(seam.willWrite).toBe(false);
  expect(seam.changedFiles).toEqual([]);
  expect(seam.writeIntents).toEqual([]);
  expect(seam.noWriterInvoked).toBe(true);
  expect(seam.noAppliedPatchRecord).toBe(true);
  expect(seam.doesNotClaimMutationSuccess).toBe(true);
  expect(seam.doesNotClaimWriteSuccess).toBe(true);
  expect(seam.safetyProof.noApprovalAsWriteAuthorization).toBe(true);
  const serialized = JSON.stringify({ routeResult, seam }).toLowerCase();
  expect(serialized).not.toContain("/home/wang/.private-agents-real");
  expect(serialized).not.toContain('"basecontent":');
  expect(serialized).not.toContain("write-success\":true");
  expect(serialized).not.toContain("mutation-success\":true");
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
