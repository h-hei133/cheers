import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSingleFileApplyPatchOptInDryRunRoute } from "./singleFileApplyPatchOptInDryRunRoute.js";
import { buildWriteDecisionGate } from "./writeDecisionGate.js";
import { type IsolatedWriteLane, runIsolatedWriteLane } from "./isolatedWriteLane.js";
import {
  buildRealProviderWriteSmokeContract,
  type RealProviderWriteSmokeContract,
} from "./realProviderWriteSmoke.js";

const workspaceRoot = path.resolve("D:/fixture/apply-patch-write");
const rawPatchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-status: draft",
  "+status: ready",
  "*** End Patch",
].join("\n");

describe("real provider apply_patch isolated write smoke contract", () => {
  it("marks the smoke ready only after explicit opt-in and verified isolated fixture write", async () => {
    const lane = await buildWrittenLane();
    const smoke = buildRealProviderWriteSmokeContract({
      explicitOptIn: true,
      syntheticWriteLaneValidated: true,
      writeLane: lane,
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      fixtureChangedFiles: ["src/app.ts"],
      expectedChangedFiles: ["src/app.ts"],
      protectedFilesUnchanged: true,
    });

    expect(smoke.status).toBe("ready");
    expect(smoke.failureAttribution).toEqual([]);
    expect(smoke.changedFiles).toEqual(["src/app.ts"]);
    expect(smoke.writeIntents).toEqual(["src/app.ts"]);
    expect(smoke.fixtureWriterInvoked).toBe(true);
    expect(smoke.terminalClassification).toBe("success");
    expect(smoke.mutationSuccessClaimAllowed).toBe(true);
    expectNoProductionLeak(smoke);
  });

  it("blocks without explicit opt-in before treating provider output as write input", async () => {
    const lane = await buildWrittenLane();
    const smoke = buildRealProviderWriteSmokeContract({
      explicitOptIn: false,
      syntheticWriteLaneValidated: true,
      writeLane: lane,
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      fixtureChangedFiles: ["src/app.ts"],
      expectedChangedFiles: ["src/app.ts"],
      protectedFilesUnchanged: true,
    });

    expect(smoke.status).toBe("blocked");
    expect(smoke.failure).toBe("explicit-opt-in-missing");
    expectNoProductionLeak(smoke);
  });

  it("blocks redaction failures separately from write-lane failures", async () => {
    const lane = await buildWrittenLane();
    const smoke = buildRealProviderWriteSmokeContract({
      explicitOptIn: true,
      syntheticWriteLaneValidated: true,
      writeLane: lane,
      redactionCheck: { ok: false, leaks: ["api-key"] },
      isolatedFixture: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      fixtureChangedFiles: ["src/app.ts"],
      expectedChangedFiles: ["src/app.ts"],
      protectedFilesUnchanged: true,
    });

    expect(smoke.status).toBe("blocked");
    expect(smoke.failure).toBe("redaction-failure");
    expect(smoke.failureAttribution).toEqual(["redaction-failure"]);
    expectNoProductionLeak(smoke);
  });

  it("blocks unexpected fixture write targets", async () => {
    const lane = await buildWrittenLane();
    const smoke = buildRealProviderWriteSmokeContract({
      explicitOptIn: true,
      syntheticWriteLaneValidated: true,
      writeLane: lane,
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      fixtureChangedFiles: ["LOCKED.md", "src/app.ts"],
      expectedChangedFiles: ["src/app.ts"],
      protectedFilesUnchanged: false,
    });

    expect(smoke.status).toBe("blocked");
    expect(smoke.failure).toBe("unexpected-write-target");
    expect(smoke.failureAttribution).toContain("unexpected-write-target");
    expectNoProductionLeak(smoke);
  });

  it("blocks success claims when the isolated write lane did not write", async () => {
    const lane = await buildBlockedLane();
    const smoke = buildRealProviderWriteSmokeContract({
      explicitOptIn: true,
      syntheticWriteLaneValidated: true,
      writeLane: lane,
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      fixtureChangedFiles: [],
      expectedChangedFiles: ["src/app.ts"],
      protectedFilesUnchanged: true,
    });

    expect(smoke.status).toBe("blocked");
    expect(smoke.failureAttribution).toContain("write-lane-failure");
    expect(smoke.terminalClassification).toBe("stopped");
    expect(smoke.mutationSuccessClaimAllowed).toBe(false);
    expectNoProductionLeak(smoke);
  });
});

async function buildWrittenLane(): Promise<IsolatedWriteLane> {
  return runIsolatedWriteLane({
    workspaceRoot,
    rawPatchText,
    permissionUx: approvedRoute().permissionUx,
    writeDecision: buildWriteDecisionGate({
      permissionUx: approvedRoute().permissionUx,
      explicitApprovedForWrite: true,
    }),
    isolatedFixture: true,
    readFile: () => "status: draft\nowner: fixture\n",
    writeFile: () => {},
  });
}

async function buildBlockedLane(): Promise<IsolatedWriteLane> {
  return runIsolatedWriteLane({
    workspaceRoot,
    rawPatchText,
    permissionUx: approvedRoute().permissionUx,
    writeDecision: buildWriteDecisionGate({
      permissionUx: approvedRoute().permissionUx,
      explicitApprovedForWrite: false,
    }),
    isolatedFixture: true,
    readFile: () => "status: draft\nowner: fixture\n",
    writeFile: () => {
      throw new Error("writeFile must not be called");
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
    throw new Error("Expected opt-in route result");
  }
  return route;
}

function expectNoProductionLeak(smoke: RealProviderWriteSmokeContract): void {
  expect(smoke.isolatedFixture).toBe(true);
  expect(smoke.privateAgentsRealRead).toBe(false);
  expect(smoke.providerConfigPrinted).toBe(false);
  expect(smoke.productionWriterInvoked).toBe(false);
  expect(smoke.noProductionWrite).toBe(true);
  expect(smoke.appliedPatchRecord).toBe(false);
  const serialized = JSON.stringify(smoke).toLowerCase();
  expect(serialized).not.toContain("/home/wang/.private-agents-real");
  expect(serialized).not.toContain('"basecontent":');
  expect(serialized).not.toContain("provider.env");
  expect(serialized).not.toContain("config.json");
}
