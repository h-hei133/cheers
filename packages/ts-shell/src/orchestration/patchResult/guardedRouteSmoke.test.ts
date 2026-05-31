import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildGuardedWriteGate } from "./guardedWriteGate.js";
import {
  buildGuardedRouteSmokeContract,
  type GuardedRouteSmokeContract,
} from "./guardedRouteSmoke.js";
import { buildSingleFileApplyPatchOptInDryRunRoute } from "./singleFileApplyPatchOptInDryRunRoute.js";
import { buildWriteDecisionGate } from "../../edit/authority/approval/decision.js";
import { runProductionRoute, type ProductionRoute } from "./productionRoute.js";

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

describe("real provider apply_patch guarded route smoke contract", () => {
  it("marks the smoke ready only after verified isolated route write", async () => {
    const productionRoute = await buildWrittenRoute();
    const smoke = buildGuardedRouteSmokeContract({
      explicitOptIn: true,
      syntheticProductionRouteValidated: true,
      productionRoute,
      redactionCheck: { ok: true, leaks: [] },
      isolatedWorkspace: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      repositoryClean: true,
      workspaceChangedFiles: ["src/app.ts"],
      expectedChangedFiles: ["src/app.ts"],
      protectedFilesUnchanged: true,
    });

    expect(smoke.status).toBe("ready");
    expect(smoke.failureAttribution).toEqual([]);
    expect(smoke.routeStatus).toBe("written");
    expect(smoke.routeGateStatus).toBe("ready");
    expect(smoke.changedFiles).toEqual(["src/app.ts"]);
    expect(smoke.writeIntents).toEqual(["src/app.ts"]);
    expect(smoke.productionWriterInvoked).toBe(true);
    expect(smoke.productionWriterTarget).toBe("isolated-workspace");
    expect(smoke.terminalClassification).toBe("success");
    expect(smoke.terminalSuccessAllowed).toBe(true);
    expectNoSecretOrRepositoryLeak(smoke);
  });

  it("blocks missing explicit opt-in before provider output is treated as route input", async () => {
    const productionRoute = await buildWrittenRoute();
    const smoke = buildGuardedRouteSmokeContract({
      explicitOptIn: false,
      syntheticProductionRouteValidated: true,
      productionRoute,
      redactionCheck: { ok: true, leaks: [] },
      isolatedWorkspace: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      repositoryClean: true,
      workspaceChangedFiles: ["src/app.ts"],
      expectedChangedFiles: ["src/app.ts"],
      protectedFilesUnchanged: true,
    });

    expect(smoke.status).toBe("blocked");
    expect(smoke.failure).toBe("explicit-opt-in-missing");
    expectNoSecretOrRepositoryLeak(smoke);
  });

  it("blocks repository mutation and redaction failures separately", async () => {
    const productionRoute = await buildWrittenRoute();
    const repositoryMutated = buildGuardedRouteSmokeContract({
      explicitOptIn: true,
      syntheticProductionRouteValidated: true,
      productionRoute,
      redactionCheck: { ok: true, leaks: [] },
      isolatedWorkspace: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      repositoryClean: false,
      workspaceChangedFiles: ["src/app.ts"],
      expectedChangedFiles: ["src/app.ts"],
      protectedFilesUnchanged: true,
    });
    const redactionFailure = buildGuardedRouteSmokeContract({
      explicitOptIn: true,
      syntheticProductionRouteValidated: true,
      productionRoute,
      redactionCheck: { ok: false, leaks: ["token"] },
      isolatedWorkspace: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      repositoryClean: true,
      workspaceChangedFiles: ["src/app.ts"],
      expectedChangedFiles: ["src/app.ts"],
      protectedFilesUnchanged: true,
    });

    expect(repositoryMutated.status).toBe("blocked");
    expect(repositoryMutated.failure).toBe("repository-mutated");
    expect(redactionFailure.status).toBe("blocked");
    expect(redactionFailure.failure).toBe("redaction-failure");
    expectNoSecretOrRepositoryLeak(repositoryMutated);
    expectNoSecretOrRepositoryLeak(redactionFailure);
  });

  it("blocks unexpected workspace targets and non-writing routes", async () => {
    const writtenRoute = await buildWrittenRoute();
    const targetLeak = buildGuardedRouteSmokeContract({
      explicitOptIn: true,
      syntheticProductionRouteValidated: true,
      productionRoute: writtenRoute,
      redactionCheck: { ok: true, leaks: [] },
      isolatedWorkspace: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      repositoryClean: true,
      workspaceChangedFiles: ["LOCKED.md", "src/app.ts"],
      expectedChangedFiles: ["src/app.ts"],
      protectedFilesUnchanged: false,
    });
    const blockedRoute = await buildBlockedRoute();
    const routeFailure = buildGuardedRouteSmokeContract({
      explicitOptIn: true,
      syntheticProductionRouteValidated: true,
      productionRoute: blockedRoute,
      redactionCheck: { ok: true, leaks: [] },
      isolatedWorkspace: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      repositoryClean: true,
      workspaceChangedFiles: [],
      expectedChangedFiles: ["src/app.ts"],
      protectedFilesUnchanged: true,
    });

    expect(targetLeak.status).toBe("blocked");
    expect(targetLeak.failure).toBe("unexpected-write-target");
    expect(routeFailure.status).toBe("blocked");
    expect(routeFailure.failureAttribution).toContain("production-route-failure");
    expect(routeFailure.terminalClassification).toBe("stopped");
    expect(routeFailure.terminalSuccessAllowed).toBe(false);
    expectNoSecretOrRepositoryLeak(targetLeak);
    expectNoSecretOrRepositoryLeak(routeFailure);
  });
});

async function buildWrittenRoute(): Promise<ProductionRoute> {
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

async function buildBlockedRoute(): Promise<ProductionRoute> {
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
      throw new Error("writer must not be called");
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
    path.join(os.tmpdir(), "single-file-apply-patch-guarded-route-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, "src", "app.ts"),
    "status: draft\nowner: smoke\n",
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

function expectNoSecretOrRepositoryLeak(smoke: GuardedRouteSmokeContract): void {
  expect(smoke.isolatedWorkspace).toBe(true);
  expect(smoke.privateAgentsRealRead).toBe(false);
  expect(smoke.providerConfigPrinted).toBe(false);
  expect(smoke.realRepositoryWrite).toBe(false);
  expect(smoke.appliedPatchRecord).toBe(false);
  const serialized = JSON.stringify(smoke).toLowerCase();
  expect(serialized).not.toContain("/home/wang/.private-agents-real");
  expect(serialized).not.toContain('"basecontent":');
  expect(serialized).not.toContain("provider.env");
  expect(serialized).not.toContain("config.json");
  expect(serialized).not.toContain("api_key");
}
