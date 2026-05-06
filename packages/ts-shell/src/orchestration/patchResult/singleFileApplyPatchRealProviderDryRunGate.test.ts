import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSingleFileApplyPatchOptInDryRunRoute } from "./singleFileApplyPatchOptInDryRunRoute.js";
import {
  buildSingleFileApplyPatchRealProviderDryRunGateContract,
  type SingleFileApplyPatchRealProviderDryRunGateContract,
} from "./singleFileApplyPatchRealProviderDryRunGate.js";

const workspaceRoot = path.resolve("D:/workspace/project");
const rawPatchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-old",
  "+new",
  "*** End Patch",
].join("\n");

describe("single-file apply_patch real provider non-mutating dry-run gate contract", () => {
  it("marks the gate ready only after opt-in, synthetic validation, no-write route, and redaction pass", () => {
    const gate = buildSingleFileApplyPatchRealProviderDryRunGateContract({
      explicitOptIn: true,
      syntheticRouteValidated: true,
      routeResult: routeResult(),
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      noWriteMode: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
    });

    expect(gate.status).toBe("ready");
    expect(gate.failure).toBeUndefined();
    expect(gate.failureAttribution).toEqual([]);
    expectNoRealProviderGateWriteLeak(gate);
    expect(gate.nextAction).toContain("explicit opt-in");
  });

  it("blocks the gate without explicit opt-in before any real provider run", () => {
    const gate = buildSingleFileApplyPatchRealProviderDryRunGateContract({
      explicitOptIn: false,
      syntheticRouteValidated: true,
      routeResult: routeResult(),
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      noWriteMode: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
    });

    expect(gate.status).toBe("blocked");
    expect(gate.failure).toBe("explicit-opt-in-missing");
    expect(gate.failureAttribution).toContain("explicit-opt-in-missing");
    expectNoRealProviderGateWriteLeak(gate);
  });

  it("blocks the gate until synthetic opt-in dry-run route validation has passed", () => {
    const gate = buildSingleFileApplyPatchRealProviderDryRunGateContract({
      explicitOptIn: true,
      syntheticRouteValidated: false,
      routeResult: routeResult(),
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      noWriteMode: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
    });

    expect(gate.status).toBe("blocked");
    expect(gate.failure).toBe("synthetic-route-not-validated");
    expect(gate.nextAction).toContain("synthetic");
    expectNoRealProviderGateWriteLeak(gate);
  });

  it("attributes redaction failures separately from route failures", () => {
    const gate = buildSingleFileApplyPatchRealProviderDryRunGateContract({
      explicitOptIn: true,
      syntheticRouteValidated: true,
      routeResult: routeResult(),
      redactionCheck: { ok: false, leaks: ["api-key"] },
      isolatedFixture: true,
      noWriteMode: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
    });

    expect(gate.status).toBe("blocked");
    expect(gate.failure).toBe("redaction-failure");
    expect(gate.failureAttribution).toEqual(["redaction-failure"]);
    expect(gate.redaction.leaks).toEqual(["api-key"]);
    expectNoRealProviderGateWriteLeak(gate);
  });

  it("blocks rejected route results as route failures", () => {
    const rejectedRoute = buildSingleFileApplyPatchOptInDryRunRoute({
      workspaceRoot,
      rawPatchText,
      dryRun: true,
      readFile: () => {
        throw new Error("readFile must not run for non-opt-in route");
      },
    });
    const gate = buildSingleFileApplyPatchRealProviderDryRunGateContract({
      explicitOptIn: true,
      syntheticRouteValidated: true,
      routeResult: rejectedRoute,
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      noWriteMode: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
    });

    expect(gate.status).toBe("blocked");
    expect(gate.failureAttribution).toContain("route-failure");
    expectNoRealProviderGateWriteLeak(gate);
  });
});

function routeResult(): Extract<
  ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
  { explicitOptIn: true }
> {
  const result = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot,
    rawPatchText,
    dryRun: true,
    explicitOptIn: true,
    requestedUserDecision: "approved",
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

function expectNoRealProviderGateWriteLeak(
  gate: SingleFileApplyPatchRealProviderDryRunGateContract,
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
