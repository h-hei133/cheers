import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSingleFileApplyPatchOptInDryRunRoute } from "./singleFileApplyPatchOptInDryRunRoute.js";
import {
  buildSingleFileApplyPatchRealProviderPermissionUxGateContract,
  type SingleFileApplyPatchRealProviderPermissionUxGateContract,
} from "./singleFileApplyPatchRealProviderPermissionUxGate.js";
import { buildSingleFileApplyPatchPermissionUxRealRouteSeam } from "./singleFileApplyPatchPermissionUxRealRouteSeam.js";

const workspaceRoot = path.resolve("D:/workspace/project");
const rawPatchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-old",
  "+new",
  "*** End Patch",
].join("\n");

describe("single-file apply_patch real provider permission UX no-write gate", () => {
  it("marks the gate ready after synthetic validation, redaction pass, and distinct no-write permission states", () => {
    const bundle = permissionBundle();
    const gate = buildSingleFileApplyPatchRealProviderPermissionUxGateContract({
      explicitOptIn: true,
      syntheticPermissionUxValidated: true,
      ...bundle,
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      noWriteMode: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
    });

    expect(gate.status).toBe("ready");
    expect(gate.permissionStatuses).toEqual({
      pending: "pending",
      denied: "denied",
      blocked: "blocked",
    });
    expect(gate.failureAttribution).toEqual([]);
    expectNoWriteGate(gate);
  });

  it("blocks without explicit opt-in before real provider permission UX execution", () => {
    const gate = buildSingleFileApplyPatchRealProviderPermissionUxGateContract({
      explicitOptIn: false,
      syntheticPermissionUxValidated: true,
      ...permissionBundle(),
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      noWriteMode: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
    });

    expect(gate.status).toBe("blocked");
    expect(gate.failure).toBe("explicit-opt-in-missing");
    expectNoWriteGate(gate);
  });

  it("blocks until synthetic permission UX integration has passed", () => {
    const gate = buildSingleFileApplyPatchRealProviderPermissionUxGateContract({
      explicitOptIn: true,
      syntheticPermissionUxValidated: false,
      ...permissionBundle(),
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      noWriteMode: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
    });

    expect(gate.status).toBe("blocked");
    expect(gate.failure).toBe("synthetic-permission-ux-not-validated");
    expectNoWriteGate(gate);
  });

  it("attributes redaction failures separately from permission UX failures", () => {
    const gate = buildSingleFileApplyPatchRealProviderPermissionUxGateContract({
      explicitOptIn: true,
      syntheticPermissionUxValidated: true,
      ...permissionBundle(),
      redactionCheck: { ok: false, leaks: ["api-key"] },
      isolatedFixture: true,
      noWriteMode: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
    });

    expect(gate.status).toBe("blocked");
    expect(gate.failure).toBe("redaction-failure");
    expect(gate.failureAttribution).toEqual(["redaction-failure"]);
    expectNoWriteGate(gate);
  });

  it("blocks when pending, denied, and blocked states collapse into one status", () => {
    const bundle = permissionBundle();
    const gate = buildSingleFileApplyPatchRealProviderPermissionUxGateContract({
      explicitOptIn: true,
      syntheticPermissionUxValidated: true,
      pendingRouteResult: bundle.pendingRouteResult,
      pendingSeam: bundle.pendingSeam,
      deniedSeam: bundle.pendingSeam,
      blockedSeam: bundle.blockedSeam,
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      noWriteMode: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
    });

    expect(gate.status).toBe("blocked");
    expect(gate.failure).toBe("permission-ux-failure");
    expectNoWriteGate(gate);
  });
});

function permissionBundle() {
  const pendingRouteResult = routeResult("pending");
  const deniedRouteResult = routeResult("denied");
  const blockedRouteResult = staleRouteResult();
  return {
    pendingRouteResult,
    pendingSeam: buildSingleFileApplyPatchPermissionUxRealRouteSeam({
      routeResult: pendingRouteResult,
      requestedUserDecision: "pending",
    }),
    deniedSeam: buildSingleFileApplyPatchPermissionUxRealRouteSeam({
      routeResult: deniedRouteResult,
      requestedUserDecision: "denied",
    }),
    blockedSeam: buildSingleFileApplyPatchPermissionUxRealRouteSeam({
      routeResult: blockedRouteResult,
      requestedUserDecision: "approved",
    }),
  };
}

function routeResult(
  requestedUserDecision: "pending" | "denied",
): Extract<
  ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
  { explicitOptIn: true }
> {
  const result = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot,
    rawPatchText,
    dryRun: true,
    explicitOptIn: true,
    requestedUserDecision,
    readFile: (absolutePath) => {
      expect(path.relative(workspaceRoot, absolutePath)).toBe("src/app.ts");
      return "old\n";
    },
  });
  if (result.explicitOptIn !== true) {
    throw new Error("Expected opt-in route result");
  }
  return result;
}

function staleRouteResult(): Extract<
  ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
  { explicitOptIn: true }
> {
  let reads = 0;
  const result = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot,
    rawPatchText,
    dryRun: true,
    explicitOptIn: true,
    requestedUserDecision: "approved",
    readFile: () => {
      reads += 1;
      return reads === 1 ? "old\n" : "changed\n";
    },
  });
  if (result.explicitOptIn !== true) {
    throw new Error("Expected opt-in route result");
  }
  return result;
}

function expectNoWriteGate(
  gate: SingleFileApplyPatchRealProviderPermissionUxGateContract,
): void {
  expect(gate.isolatedFixture).toBe(true);
  expect(gate.noWriteMode).toBe(true);
  expect(gate.privateAgentsRealRead).toBe(false);
  expect(gate.providerConfigPrinted).toBe(false);
  expect(gate.willWrite).toBe(false);
  expect(gate.changedFiles).toEqual([]);
  expect(gate.writeIntents).toEqual([]);
  expect(gate.noWriterInvoked).toBe(true);
  expect(gate.noAppliedPatchRecord).toBe(true);
  expect(gate.doesNotClaimMutationSuccess).toBe(true);
  expect(gate.doesNotClaimWriteSuccess).toBe(true);
  const serialized = JSON.stringify(gate).toLowerCase();
  expect(serialized).not.toContain("/home/wang/.private-agents-real");
  expect(serialized).not.toContain('"basecontent":');
  expect(serialized).not.toContain("write-success\":true");
  expect(serialized).not.toContain("mutation-success\":true");
  expect(serialized).not.toContain("\"applied\"");
}
