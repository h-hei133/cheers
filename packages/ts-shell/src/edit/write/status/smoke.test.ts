import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildGuardedWriteGate } from "./guard.js";
import {
  buildGuardedWriteSmokeContract,
  type GuardedWriteSmokeContract,
} from "./smoke.js";
import { buildSingleFileApplyPatchOptInDryRunRoute } from "../../patch/apply/optIn.js";
import { runProductionWriteLane, type ProductionWriteLane } from "./production.js";
import { buildWriteDecisionGate } from "../../authority/approval/decision.js";

const workspaceRoot = path.resolve("D:/fixture/guarded-write");
const rawPatchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-status: draft",
  "+status: ready",
  "*** End Patch",
].join("\n");

describe("real provider apply_patch guarded write smoke contract", () => {
  it("marks the smoke ready only after verified isolated workspace write", async () => {
    const lane = await buildWrittenLane();
    const smoke = buildGuardedWriteSmokeContract({
      explicitOptIn: true,
      syntheticProductionLaneValidated: true,
      writeLane: lane,
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
    expect(smoke.changedFiles).toEqual(["src/app.ts"]);
    expect(smoke.writeIntents).toEqual(["src/app.ts"]);
    expect(smoke.productionWriterInvoked).toBe(true);
    expect(smoke.productionWriterTarget).toBe("isolated-workspace");
    expect(smoke.terminalClassification).toBe("success");
    expect(smoke.terminalSuccessAllowed).toBe(true);
    expectNoSecretOrRepositoryLeak(smoke);
  });

  it("blocks missing explicit opt-in before provider output is treated as write input", async () => {
    const lane = await buildWrittenLane();
    const smoke = buildGuardedWriteSmokeContract({
      explicitOptIn: false,
      syntheticProductionLaneValidated: true,
      writeLane: lane,
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
    const lane = await buildWrittenLane();
    const repositoryMutated = buildGuardedWriteSmokeContract({
      explicitOptIn: true,
      syntheticProductionLaneValidated: true,
      writeLane: lane,
      redactionCheck: { ok: true, leaks: [] },
      isolatedWorkspace: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      repositoryClean: false,
      workspaceChangedFiles: ["src/app.ts"],
      expectedChangedFiles: ["src/app.ts"],
      protectedFilesUnchanged: true,
    });
    const redactionFailure = buildGuardedWriteSmokeContract({
      explicitOptIn: true,
      syntheticProductionLaneValidated: true,
      writeLane: lane,
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

  it("blocks unexpected workspace targets and non-writing lanes", async () => {
    const writtenLane = await buildWrittenLane();
    const targetLeak = buildGuardedWriteSmokeContract({
      explicitOptIn: true,
      syntheticProductionLaneValidated: true,
      writeLane: writtenLane,
      redactionCheck: { ok: true, leaks: [] },
      isolatedWorkspace: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      repositoryClean: true,
      workspaceChangedFiles: ["LOCKED.md", "src/app.ts"],
      expectedChangedFiles: ["src/app.ts"],
      protectedFilesUnchanged: false,
    });
    const blockedLane = await buildBlockedLane();
    const laneFailure = buildGuardedWriteSmokeContract({
      explicitOptIn: true,
      syntheticProductionLaneValidated: true,
      writeLane: blockedLane,
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
    expect(laneFailure.status).toBe("blocked");
    expect(laneFailure.failureAttribution).toContain("write-lane-failure");
    expect(laneFailure.terminalClassification).toBe("stopped");
    expect(laneFailure.terminalSuccessAllowed).toBe(false);
    expectNoSecretOrRepositoryLeak(targetLeak);
    expectNoSecretOrRepositoryLeak(laneFailure);
  });
});

async function buildWrittenLane(): Promise<ProductionWriteLane> {
  const route = approvedRoute();
  const writeDecision = buildWriteDecisionGate({
    permissionUx: route.permissionUx,
    explicitApprovedForWrite: true,
  });
  return runProductionWriteLane({
    workspaceRoot,
    rawPatchText,
    permissionUx: route.permissionUx,
    guardedGate: buildGuardedWriteGate({
      explicitOptIn: true,
      writeDecision,
      singleFileUpdateOnly: true,
      defaultProductionRejectionUnchanged: true,
    }),
    isolatedWorkspace: true,
    readFile: () => "status: draft\nowner: fixture\n",
    writeFile: () => {},
  });
}

async function buildBlockedLane(): Promise<ProductionWriteLane> {
  const route = approvedRoute();
  const writeDecision = buildWriteDecisionGate({
    permissionUx: route.permissionUx,
    explicitApprovedForWrite: true,
  });
  return runProductionWriteLane({
    workspaceRoot,
    rawPatchText,
    permissionUx: route.permissionUx,
    guardedGate: buildGuardedWriteGate({
      explicitOptIn: false,
      writeDecision,
      singleFileUpdateOnly: true,
      defaultProductionRejectionUnchanged: true,
    }),
    isolatedWorkspace: true,
    readFile: () => "status: draft\nowner: fixture\n",
    writeFile: () => {
      throw new Error("writer must not be called");
    },
  });
}

function approvedRoute(): Extract<
  ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
  { explicitOptIn: true }
> {
  const route = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot,
    rawPatchText,
    dryRun: true,
    explicitOptIn: true,
    requestedUserDecision: "approved",
    readFile: (absolutePath) => {
      expect(path.relative(workspaceRoot, absolutePath)).toBe("src/app.ts");
      return "status: draft\nowner: fixture\n";
    },
  });
  if (route.explicitOptIn !== true) {
    throw new Error("Expected explicit opt-in route");
  }
  return route;
}

function expectNoSecretOrRepositoryLeak(smoke: GuardedWriteSmokeContract): void {
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
