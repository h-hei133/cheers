import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildNoWriteRuntimeRoute } from "../../edit/write/status/noWrite.js";
import {
  buildRuntimeNoWriteSmokeContract,
  type RuntimeNoWriteSmokeContract,
} from "./runtimeNoWriteSmoke.js";

const workspaceRoot = path.resolve("D:/fixture/runtime-no-write");
const rawPatchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-status: draft",
  "+status: ready",
  "*** End Patch",
].join("\n");

describe("real provider runtime no-write smoke contract", () => {
  it("is ready only for explicit opt-in, redacted, unchanged no-write runtime output", () => {
    const smoke = buildRuntimeNoWriteSmokeContract({
      explicitOptIn: true,
      syntheticRuntimeValidated: true,
      route: route("pending"),
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      fixtureUnchanged: true,
      repositoryClean: true,
    });

    expect(smoke.status).toBe("ready");
    expect(smoke.failureAttribution).toEqual([]);
    expect(smoke.routeStatus).toBe("permission-pending");
    expect(smoke.displayStatus).toBe("permission-pending");
    expectNoWriteNoLeak(smoke);
  });

  it("blocks missing explicit opt-in", () => {
    const smoke = buildRuntimeNoWriteSmokeContract({
      explicitOptIn: false,
      syntheticRuntimeValidated: true,
      route: route("pending"),
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      fixtureUnchanged: true,
      repositoryClean: true,
    });

    expect(smoke.status).toBe("blocked");
    expect(smoke.failure).toBe("explicit-opt-in-missing");
    expectNoWriteNoLeak(smoke);
  });

  it("blocks redaction failures separately", () => {
    const smoke = buildRuntimeNoWriteSmokeContract({
      explicitOptIn: true,
      syntheticRuntimeValidated: true,
      route: route("pending"),
      redactionCheck: { ok: false, leaks: ["api-key"] },
      isolatedFixture: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      fixtureUnchanged: true,
      repositoryClean: true,
    });

    expect(smoke.status).toBe("blocked");
    expect(smoke.failure).toBe("redaction-failure");
    expectNoWriteNoLeak(smoke);
  });

  it("blocks fixture or repository mutation", () => {
    const fixtureSmoke = buildRuntimeNoWriteSmokeContract({
      explicitOptIn: true,
      syntheticRuntimeValidated: true,
      route: route("pending"),
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      fixtureUnchanged: false,
      repositoryClean: true,
    });
    const repoSmoke = buildRuntimeNoWriteSmokeContract({
      explicitOptIn: true,
      syntheticRuntimeValidated: true,
      route: route("pending"),
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      fixtureUnchanged: true,
      repositoryClean: false,
    });

    expect(fixtureSmoke.failureAttribution).toContain("fixture-mutated");
    expect(repoSmoke.failureAttribution).toContain("repository-mutated");
    expectNoWriteNoLeak(fixtureSmoke);
    expectNoWriteNoLeak(repoSmoke);
  });

  it("accepts denied runtime output as no-write smoke surface", () => {
    const smoke = buildRuntimeNoWriteSmokeContract({
      explicitOptIn: true,
      syntheticRuntimeValidated: true,
      route: route("denied"),
      redactionCheck: { ok: true, leaks: [] },
      isolatedFixture: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      fixtureUnchanged: true,
      repositoryClean: true,
    });

    expect(smoke.status).toBe("ready");
    expect(smoke.displayStatus).toBe("denied");
    expectNoWriteNoLeak(smoke);
  });
});

function route(
  requestedUserDecision: "pending" | "denied",
): ReturnType<typeof buildNoWriteRuntimeRoute> {
  return buildNoWriteRuntimeRoute({
    workspaceRoot,
    rawPatchText,
    explicitRuntimeOptIn: true,
    requestedUserDecision,
    runtimeSource: "real-provider-smoke",
    readFile: (absolutePath) => {
      expect(path.relative(workspaceRoot, absolutePath)).toBe("src/app.ts");
      return "status: draft\n";
    },
  });
}

function expectNoWriteNoLeak(smoke: RuntimeNoWriteSmokeContract): void {
  expect(smoke.isolatedFixture).toBe(true);
  expect(smoke.privateAgentsRealRead).toBe(false);
  expect(smoke.providerConfigPrinted).toBe(false);
  expect(smoke.terminalClassification).toBe("stopped");
  expect(smoke.willWrite).toBe(false);
  expect(smoke.changedFiles).toEqual([]);
  expect(smoke.writeIntents).toEqual([]);
  expect(smoke.noWriterInvoked).toBe(true);
  expect(smoke.noAppliedPatchRecord).toBe(true);
  expect(smoke.terminalNoSuccessClaim).toBe(true);
  const serialized = JSON.stringify(smoke).toLowerCase();
  expect(serialized).not.toContain("/home/wang/.private-agents-real");
  expect(serialized).not.toContain("provider.env");
  expect(serialized).not.toContain("config.json");
  expect(serialized).not.toContain('"basecontent":');
  expect(serialized).not.toContain("write-success\":true");
  expect(serialized).not.toContain("mutation-success\":true");
}
