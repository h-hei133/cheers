import { describe, expect, it } from "vitest";
import { createBrowserActionContract } from "../../browser/actionContract.js";
import { createBrowserExecutionRequest } from "../../browser/executionContract.js";
import { parseBrowserCommandArgs } from "../../browser/commandContract.js";
import { runBrowserCommandAsync } from "../../browser/commandRunner.js";
import { runBrowserActionLoopExecutor } from "../../browser/actionLoopExecutor.js";
import { BrowserRuntimeAdapterExecutor } from "../../browser/runtime/core/adapterExecutor.js";
import { validateBrowserSkillRuntimeBinding, type BrowserSkillRuntimeBinding } from "../../browser/skill/runtime/binding.js";
import { validateBrowserRuntimeManifest } from "../../browser/runtime/core/manifest.js";
import {
  createBrowserRuntimeAdapterFixture,
} from "./browserRuntimeAdapterFixtures.js";
import { browserRuntimeRequest } from "./browserRuntimeCapabilityScenarioFixtures.js";

describe("browser runtime adapter scenario examples", () => {
  it("reports unavailable when no adapter manifest is supplied", async () => {
    const parsed = parseBrowserCommandArgs(["runtime", "status"]);
    const result = await runBrowserCommandAsync({ contract: parsed.contract! });
    expect(result.output).toContain("- Status: unavailable");
    expect(result.output).toContain("- Explicit manifest: required");
  });

  it("shows external runtime status via explicit temp runner manifest", async () => {
    const fixture = createBrowserRuntimeAdapterFixture();
    try {
      const parsed = parseBrowserCommandArgs(["runtime", "status"]);
      const result = await runBrowserCommandAsync({
        contract: parsed.contract!,
        browserExternalRuntimeManifest: fixture.externalManifest,
      });
      expect(result.output).toContain("Browser runtime status");
      expect(result.output).toContain("available-external");
    } finally {
      fixture.cleanup();
    }
  });

  it("external runtime observe returns validated DOM and accessibility snapshots", async () => {
    const fixture = createBrowserRuntimeAdapterFixture();
    try {
      const result = await runExternal(fixture, browserRuntimeRequest("observe", fixture.origin));
      expect(result.receipt.executed).toBe(true);
      expect(result.receipt.domSnapshotId).toContain("dom:");
      expect(result.receipt.accessibilitySnapshotId).toContain("accessibility:");
      expect(result.observation?.textSummary).toContain("Route 124 Adapter");
    } finally {
      fixture.cleanup();
    }
  });

  it("external runtime extract returns provenance and citation records", async () => {
    const fixture = createBrowserRuntimeAdapterFixture();
    try {
      const result = await runExternal(fixture, browserRuntimeRequest("extract", fixture.origin));
      expect(result.receipt.provenanceId).toContain("browser-provenance:");
      expect(result.observation?.provenance.citationLabels.join(" ")).toContain("browser-observation:");
    } finally {
      fixture.cleanup();
    }
  });

  it("external runtime click safe button returns post-action observation", async () => {
    const fixture = createBrowserRuntimeAdapterFixture();
    try {
      const result = await runExternal(fixture, browserRuntimeRequest("click", "Save draft"));
      expect(result.receipt.executed).toBe(true);
      expect(result.observation?.textSummary).toContain("Clicked Save draft");
      expect(result.receipt.actionTargetId).toContain("browser-target:click");
    } finally {
      fixture.cleanup();
    }
  });

  it("external runtime type safe input returns post-action observation", async () => {
    const fixture = createBrowserRuntimeAdapterFixture();
    try {
      const result = await runExternal(fixture, browserRuntimeRequest("type", "Safe note", "hello"));
      expect(result.receipt.executed).toBe(true);
      expect(result.observation?.textSummary).toContain("Updated Safe note");
    } finally {
      fixture.cleanup();
    }
  });

  it("blocks password, payment, and destructive targets before safe action execution", async () => {
    const fixture = createBrowserRuntimeAdapterFixture();
    try {
      const password = await runExternal(fixture, browserRuntimeRequest("type", "Password", "secret"));
      const payment = await runExternal(fixture, browserRuntimeRequest("type", "Credit card", "4111111111111111"));
      const destructive = await runExternal(fixture, createBrowserExecutionRequest({
        mode: "test-local",
        source: "scenario-harness",
        action: createBrowserActionContract({
          actionKind: "destructive",
          target: "delete all",
          userIntentSummary: "delete all",
          requiresNetwork: false,
          requiresAuth: false,
        }),
      }));
      expect(password.policy.status).toBe("blocked-sensitive-target");
      expect(payment.policy.status).toBe("blocked-sensitive-target");
      expect(destructive.receipt.executed).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("blocks public click/type and invalid or timed-out runners", async () => {
    const fixture = createBrowserRuntimeAdapterFixture();
    try {
      const publicClick = await runExternal(fixture, createBrowserExecutionRequest({
        mode: "test-local",
        source: "scenario-harness",
        action: createBrowserActionContract({
          actionKind: "click",
          target: "Save draft",
          url: "https://example.com",
          userIntentSummary: "public click",
          requiresNetwork: true,
          requiresAuth: false,
        }),
      }));
      const invalid = await runAdapter(fixture.invalidManifest, browserRuntimeRequest("observe", fixture.origin));
      const timeout = await runAdapter(fixture.timeoutManifest, browserRuntimeRequest("observe", fixture.origin));
      expect(publicClick.receipt.executed).toBe(false);
      expect(publicClick.policy.status).toBe("blocked-public-origin");
      expect(invalid.receipt.executed).toBe(false);
      expect(timeout.receipt.executed).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("redacts raw DOM secrets and supports skill-managed test binding", async () => {
    const fixture = createBrowserRuntimeAdapterFixture();
    try {
      const result = await runAdapter(fixture.skillManifest, browserRuntimeRequest("observe", fixture.origin), fixture.skillBinding);
      const serialized = JSON.stringify(result.receipt) + JSON.stringify(result.observation);
      expect(result.receipt.executed).toBe(true);
      expect(result.receipt.redactions).toContain("secret-looking-field");
      expect(serialized).not.toContain("sk-route124SECRET");
      if (fixture.skillManifest.status !== "valid") {
        throw new Error("skill fixture manifest must be valid");
      }
      expect(validateBrowserSkillRuntimeBinding({
        manifest: fixture.skillManifest.manifest,
      }).status).toBe("future-skill-runtime-required");
    } finally {
      fixture.cleanup();
    }
  });

  it("integrates adapter execute output into /browser and sidebar-safe summaries", async () => {
    const fixture = createBrowserRuntimeAdapterFixture();
    try {
      const parsed = parseBrowserCommandArgs(["execute", "observe", fixture.origin]);
      const result = await runBrowserCommandAsync({
        contract: parsed.contract!,
        browserExternalRuntimeManifest: fixture.externalManifest,
      });
      expect(result.output).toContain("Browser runtime execution");
      expect(result.output).toContain("Runtime mode: external-browser-runtime");
      expect(result.output).toContain("DOM snapshot id:");
      expect(result.output).not.toContain("<main>");
    } finally {
      fixture.cleanup();
    }
  });
});

async function runExternal(
  fixture: ReturnType<typeof createBrowserRuntimeAdapterFixture>,
  request: Parameters<typeof runBrowserActionLoopExecutor>[0]["request"],
) {
  return runAdapter(fixture.externalManifest, request);
}

async function runAdapter(
  manifestLoad: ReturnType<typeof createBrowserRuntimeAdapterFixture>["externalManifest"],
  request: Parameters<typeof runBrowserActionLoopExecutor>[0]["request"],
  skillBinding?: BrowserSkillRuntimeBinding,
) {
  const runtimeManifest = manifestLoad.status === "valid"
    ? manifestLoad.runtimeManifest
    : validateBrowserRuntimeManifest(undefined);
  return runBrowserActionLoopExecutor({
    request,
    manifestLoad: runtimeManifest,
    executor: new BrowserRuntimeAdapterExecutor(manifestLoad, skillBinding),
  });
}
