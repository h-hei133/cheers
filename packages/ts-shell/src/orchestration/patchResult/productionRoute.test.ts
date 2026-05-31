import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applySingleFileReplacePatch,
  type SingleFileReplacePatchResult,
} from "../patchMutationLane.js";
import { buildGuardedWriteGate } from "./guardedWriteGate.js";
import { buildSingleFileApplyPatchOptInDryRunRoute } from "./singleFileApplyPatchOptInDryRunRoute.js";
import { buildWriteDecisionGate } from "../../edit/authority/approval/decision.js";
import { runProductionRoute, type ProductionRoute } from "./productionRoute.js";

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

describe("single-file apply_patch guarded production route", () => {
  it("writes one isolated workspace target through explicit route opt-in", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const route = buildApprovedDryRunRoute(fixture.workspaceRoot);

    const result = await runProductionRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      permissionUx: route.permissionUx,
      guardedGate: readyGuardedGate(fixture.workspaceRoot),
      explicitRouteOptIn: true,
      singleFileUpdateOnly: true,
      defaultProductionRejectionUnchanged: true,
      safeResultSessionProjection: true,
      isolatedWorkspace: true,
      readFile: readFixtureFile(fixture.workspaceRoot),
      writeFile: writeFixtureFile(fixture.workspaceRoot),
    });
    const after = snapshotFixture(fixture.workspaceRoot);

    expect(result.status).toBe("written");
    expect(result.routeGate.status).toBe("ready");
    expect(result.writeLane.status).toBe("written");
    expect(result.changedFiles).toEqual(["src/app.ts"]);
    expect(result.writeIntents).toEqual(["src/app.ts"]);
    expect(result.productionWriterInvoked).toBe(true);
    expect(result.productionWriterTarget).toBe("isolated-workspace");
    expect(result.realRepositoryWrite).toBe(false);
    expect(result.terminalClassification).toBe("success");
    expect(result.terminalSuccessAllowed).toBe(true);
    expect(result.mutationSuccessClaimAllowed).toBe(true);
    expect(result.resultSessionStatus).toBe("write-success");
    expect(after["src/app.ts"]).toBe("status: ready\nowner: route\n");
    expect(after["LOCKED.md"]).toBe(before["LOCKED.md"]);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  });

  it("keeps non-opt-in routed requests rejected without invoking the writer", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const route = buildApprovedDryRunRoute(fixture.workspaceRoot);

    const result = await runProductionRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      permissionUx: route.permissionUx,
      guardedGate: readyGuardedGate(fixture.workspaceRoot),
      explicitRouteOptIn: false,
      singleFileUpdateOnly: true,
      defaultProductionRejectionUnchanged: true,
      safeResultSessionProjection: true,
      isolatedWorkspace: true,
      readFile: readFixtureFile(fixture.workspaceRoot),
      writeFile: () => {
        throw new Error("writer must stay unreachable without route opt-in");
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("route-wiring-gate");
    expect(result.routeGate.blocker).toBe("explicit-route-opt-in-missing");
    expectNoBlockedRouteLeak(result);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("blocks final stale-read failures immediately before writer", async () => {
    const fixture = createFixture();
    const route = buildApprovedDryRunRoute(fixture.workspaceRoot);
    const guardedGate = readyGuardedGate(fixture.workspaceRoot);
    fs.writeFileSync(
      path.join(fixture.workspaceRoot, "src", "app.ts"),
      "status: draft\nowner: changed-after-approval\n",
      "utf8",
    );
    const before = snapshotFixture(fixture.workspaceRoot);

    const result = await runProductionRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      permissionUx: route.permissionUx,
      guardedGate,
      explicitRouteOptIn: true,
      singleFileUpdateOnly: true,
      defaultProductionRejectionUnchanged: true,
      safeResultSessionProjection: true,
      isolatedWorkspace: true,
      readFile: readFixtureFile(fixture.workspaceRoot),
      writeFile: () => {
        throw new Error("writer must stay unreachable after stale-read");
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("write-lane");
    expect(result.writeLane?.blocker).toBe("final-stale-read");
    expect(result.writeLane?.finalStaleRead?.blocker).toBe("stale-read");
    expectNoBlockedRouteLeak(result);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("does not write for denied permission or unsupported patch shapes", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const denied = buildDeniedDryRunRoute(fixture.workspaceRoot);
    const deniedGate = buildGuardedWriteGate({
      explicitOptIn: true,
      writeDecision: buildWriteDecisionGate({
        permissionUx: denied.permissionUx,
        explicitApprovedForWrite: true,
      }),
      singleFileUpdateOnly: true,
      defaultProductionRejectionUnchanged: true,
    });

    const deniedResult = await runProductionRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      permissionUx: denied.permissionUx,
      guardedGate: deniedGate,
      explicitRouteOptIn: true,
      singleFileUpdateOnly: true,
      defaultProductionRejectionUnchanged: true,
      safeResultSessionProjection: true,
      isolatedWorkspace: true,
      readFile: readFixtureFile(fixture.workspaceRoot),
      writeFile: () => {
        throw new Error("writer must stay unreachable for denied permission");
      },
    });

    const unsupportedResult = await runProductionRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: [
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+new",
        "*** End Patch",
      ].join("\n"),
      permissionUx: buildApprovedDryRunRoute(fixture.workspaceRoot).permissionUx,
      guardedGate: readyGuardedGate(fixture.workspaceRoot),
      explicitRouteOptIn: true,
      singleFileUpdateOnly: false,
      defaultProductionRejectionUnchanged: true,
      safeResultSessionProjection: true,
      isolatedWorkspace: true,
      readFile: readFixtureFile(fixture.workspaceRoot),
      writeFile: () => {
        throw new Error("writer must stay unreachable for unsupported patches");
      },
    });

    expect(deniedResult.status).toBe("blocked");
    expect(deniedResult.routeGate.blocker).toBe("guarded-gate-not-ready");
    expect(unsupportedResult.status).toBe("blocked");
    expect(unsupportedResult.routeGate.blocker).toBe("unsupported-operation");
    expectNoBlockedRouteLeak(deniedResult);
    expectNoBlockedRouteLeak(unsupportedResult);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
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

function readyGuardedGate(
  workspaceRoot: string,
): ReturnType<typeof buildGuardedWriteGate> {
  const route = buildApprovedDryRunRoute(workspaceRoot);
  const writeDecision = buildWriteDecisionGate({
    permissionUx: route.permissionUx,
    explicitApprovedForWrite: true,
  });
  return buildGuardedWriteGate({
    explicitOptIn: true,
    writeDecision,
    singleFileUpdateOnly: true,
    defaultProductionRejectionUnchanged: true,
  });
}

function buildApprovedDryRunRoute(
  workspaceRoot: string,
): Extract<
  ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
  { explicitOptIn: true }
> {
  const route = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot,
    rawPatchText: applyPatchText,
    dryRun: true,
    explicitOptIn: true,
    requestedUserDecision: "approved",
    readFile: readFixtureFile(workspaceRoot),
  });
  if (route.explicitOptIn !== true) {
    throw new Error("Expected explicit opt-in route");
  }
  return route;
}

function buildDeniedDryRunRoute(
  workspaceRoot: string,
): Extract<
  ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
  { explicitOptIn: true }
> {
  const route = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot,
    rawPatchText: applyPatchText,
    dryRun: true,
    explicitOptIn: true,
    requestedUserDecision: "denied",
    readFile: readFixtureFile(workspaceRoot),
  });
  if (route.explicitOptIn !== true) {
    throw new Error("Expected explicit opt-in route");
  }
  return route;
}

function createFixture(): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "single-file-apply-patch-production-route-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, "src", "app.ts"),
    "status: draft\nowner: route\n",
    "utf8",
  );
  fs.writeFileSync(path.join(workspaceRoot, "LOCKED.md"), "do not modify\n", "utf8");
  return { workspaceRoot };
}

function readFixtureFile(
  workspaceRoot: string,
): (absolutePath: string) => string | undefined {
  return (absolutePath) =>
    fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : undefined;
}

function writeFixtureFile(
  workspaceRoot: string,
): (relativePath: string, content: string) => void {
  return (relativePath, content) => {
    const absolutePath = path.resolve(workspaceRoot, relativePath);
    const relative = path.relative(workspaceRoot, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Refusing to write outside isolated workspace");
    }
    fs.writeFileSync(absolutePath, content, "utf8");
  };
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

function expectNoBlockedRouteLeak(
  result: Extract<ProductionRoute, { status: "blocked" }>,
): void {
  expect(result.changedFiles).toEqual([]);
  expect(result.writeIntents).toEqual([]);
  expect(result.productionWriterInvoked).toBe(false);
  expect(result.productionWriterTarget).toBe("none");
  expect(result.realRepositoryWrite).toBe(false);
  expect(result.appliedPatchRecord).toBe(false);
  expect(result.terminalClassification).toBe("stopped");
  expect(result.terminalSuccessAllowed).toBe(false);
  expect(result.mutationSuccessClaimAllowed).toBe(false);
  expect(result.resultSessionStatus).toBe("stopped");
  expect(result.evidence).toEqual(
    expect.arrayContaining([
      "apply-patch-production-route:changed-files-empty",
      "apply-patch-production-route:write-intents-empty",
      "apply-patch-production-route:production-writer-invoked-false",
      "apply-patch-production-route:real-repository-write-false",
      "apply-patch-production-route:no-success-claim",
    ]),
  );
}
