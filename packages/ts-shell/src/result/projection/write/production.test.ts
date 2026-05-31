import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildGuardedWriteGate } from "../../../edit/write/status/guard.js";
import { runProductionRoute } from "../../../orchestration/patchResult/productionRoute.js";
import { buildProductionRouteRuntimeProjection } from "./production.js";
import { buildSingleFileApplyPatchOptInDryRunRoute } from "../../../edit/patch/apply/optIn.js";
import { buildWriteDecisionGate } from "../../../edit/authority/approval/decision.js";

const rawPatchText = [
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

describe("single-file apply_patch production route runtime projection", () => {
  it("maps verified guarded writes to result/session write success", async () => {
    const route = await buildWrittenRoute();

    const projection = buildProductionRouteRuntimeProjection({
      productionRoute: route,
    });

    expect(projection.status).toBe("write-success");
    expect(projection.terminalStatus).toBe("completed");
    expect(projection.terminalClassification).toBe("success");
    expect(projection.changedFiles).toEqual(["src/app.ts"]);
    expect(projection.writeIntents).toEqual(["src/app.ts"]);
    expect(projection.productionWriterInvoked).toBe(true);
    expect(projection.productionWriterTarget).toBe("isolated-workspace");
    expect(projection.realRepositoryWrite).toBe(false);
    expect(projection.appliedPatchRecord).toBe(false);
    expect(projection.resultMapperOutput.codingResult?.changedFiles).toEqual([
      "src/app.ts",
    ]);
    expect(projection.resultMapperOutput.codingResult?.verification.status).toBe(
      "passed",
    );
    expect(projection.sessionDisplay.displayStatus).toBe("write-success");
    expect(projection.sessionDisplay.writeSuccessDisplayed).toBe(true);
    expect(projection.sessionDisplay.changedDisplay).toEqual(["src/app.ts"]);
    expect(projection.safetyProof.successAfterVerifiedWrite).toBe(true);
    expect(projection.safetyProof.blockedHasNoSuccessLeak).toBe(false);
  });

  it("downgrades blocked routes before result/session success can leak", async () => {
    const route = await buildBlockedRoute();

    const projection = buildProductionRouteRuntimeProjection({
      productionRoute: route,
    });

    expect(projection.status).toBe("blocked");
    expect(projection.terminalStatus).toBe("stopped_error");
    expect(projection.terminalClassification).toBe("stopped");
    expect(projection.changedFiles).toEqual([]);
    expect(projection.writeIntents).toEqual([]);
    expect(projection.productionWriterInvoked).toBe(false);
    expect(projection.realRepositoryWrite).toBe(false);
    expect(projection.sessionDisplay.displayStatus).toBe("blocked");
    expect(projection.sessionDisplay.writeSuccessDisplayed).toBe(false);
    expect(projection.sessionDisplay.mutationSuccessDisplayed).toBe(false);
    expect(projection.sessionDisplay.changedDisplay).toEqual([]);
    expect(projection.safetyProof.successAfterVerifiedWrite).toBe(false);
    expect(projection.safetyProof.blockedHasNoSuccessLeak).toBe(true);
    expect(JSON.stringify(projection).toLowerCase()).not.toContain(
      "/home/wang/.private-agents-real",
    );
  });
});

async function buildWrittenRoute() {
  const fixture = createFixture();
  const route = approvedRoute(fixture.workspaceRoot);
  return runProductionRoute({
    workspaceRoot: fixture.workspaceRoot,
    rawPatchText,
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
}

async function buildBlockedRoute() {
  const fixture = createFixture();
  const route = approvedRoute(fixture.workspaceRoot);
  return runProductionRoute({
    workspaceRoot: fixture.workspaceRoot,
    rawPatchText,
    permissionUx: route.permissionUx,
    guardedGate: readyGuardedGate(fixture.workspaceRoot),
    explicitRouteOptIn: false,
    singleFileUpdateOnly: true,
    defaultProductionRejectionUnchanged: true,
    safeResultSessionProjection: true,
    isolatedWorkspace: true,
    readFile: readFixtureFile(fixture.workspaceRoot),
    writeFile: () => {
      throw new Error("writer must not run for blocked route projection");
    },
  });
}

function readyGuardedGate(
  workspaceRoot: string,
): ReturnType<typeof buildGuardedWriteGate> {
  const route = approvedRoute(workspaceRoot);
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

function approvedRoute(
  workspaceRoot: string,
): Extract<
  ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
  { explicitOptIn: true }
> {
  const route = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot,
    rawPatchText,
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

function createFixture(): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "single-file-apply-patch-route-projection-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, "src", "app.ts"),
    "status: draft\nowner: projection\n",
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
