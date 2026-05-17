import { describe, expect, it } from "vitest";
import { createBrowserCliExecutionBridge } from "./browserCliExecutionBridge.js";
import {
  BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV,
  BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV,
  loadBrowserCliExecutorInjectionFromEnv,
} from "./browserCliExecutorInjection.js";
import {
  createBrowserExternalRunnerManifest,
  serializeBrowserExternalRunnerManifest,
} from "./browserExternalRunnerManifest.js";
import {
  createBrowserLocalFixtureManifest,
  serializeBrowserLocalFixtureManifest,
} from "./browserLocalFixtureManifest.js";

describe("browser CLI execution bridge", () => {
  it("keeps execution disabled when injection is absent", () => {
    const bridge = createBrowserCliExecutionBridge(
      loadBrowserCliExecutorInjectionFromEnv({ env: {} }),
    );

    expect(bridge.browserExecutor).toBeUndefined();
    expect(bridge.browserCliExecutionBridgeSummary.executionMode).toBe("disabled");
    expect(bridge.browserCliExecutionBridgeSummary.manifestStatus).toBe("missing");
    expect(bridge.browserCliExecutionBridgeSummary.dependencyDecision).toContain("external-runner-only");
    expect(bridge.browserCliExecutionBridgeSummary.externalRunnerStatus).toBe("blocked-missing-config");
  });

  it("constructs local fixture executor context only for a valid manifest", async () => {
    const manifest = createBrowserLocalFixtureManifest({
      fixture: {
        id: "fixture:route100",
        url: "local-fixture://route100",
        textSummary: "Safe route 100 content.",
      },
    });
    const bridge = createBrowserCliExecutionBridge(
      loadBrowserCliExecutorInjectionFromEnv({
        env: { [BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV]: "/tmp/manifest.json" },
        readFile: () => serializeBrowserLocalFixtureManifest(manifest),
      }),
    );

    expect(bridge.browserExecutor?.kind).toBe("local-fixture");
    expect(bridge.browserSandboxAuthority?.mode).toBe("local-fixture");
    expect(bridge.browserNetworkAllowlist?.allowedOrigins).toEqual([]);
    expect(bridge.browserCliExecutionBridgeSummary.executorSource).toBe("cli-harness");
    expect(bridge.browserCliExecutionBridgeSummary.externalRunnerStatus).toBe("allowed");
    expect(bridge.browserCliExecutionBridgeSummary.evidence).toContain(
      "browser-cli-execution-bridge:no-playwright-process",
    );
  });

  it("constructs playwright-local executor context only for an explicit manifest mode", async () => {
    const manifest = createBrowserLocalFixtureManifest({
      executorMode: "playwright-local",
      fixture: {
        id: "fixture:route101",
        url: "local-fixture://route101",
        textSummary: "Safe route 101 content.",
      },
    });
    const bridge = createBrowserCliExecutionBridge(
      loadBrowserCliExecutorInjectionFromEnv({
        env: { [BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV]: "/tmp/manifest.json" },
        readFile: () => serializeBrowserLocalFixtureManifest(manifest),
      }),
    );

    expect(bridge.browserExecutor?.kind).toBe("playwright-local");
    expect(bridge.browserSandboxAuthority?.mode).toBe("local-fixture");
    expect(bridge.browserCliExecutionBridgeSummary.executionMode).toBe("playwright-local");
    expect(bridge.browserCliExecutionBridgeSummary.dependencyDecision).toContain("external-runner-only");
    expect(bridge.browserCliExecutionBridgeSummary.externalRunnerStatus).toBe("allowed");
    expect(bridge.browserCliExecutionBridgeSummary.evidence).toContain(
      "browser-cli-execution-bridge:playwright-local-requested",
    );
  });

  it("constructs external runner executor context only for an explicit runner manifest", async () => {
    const manifest = createBrowserExternalRunnerManifest({
      runnerCommand: {
        command: process.execPath,
        args: ["/tmp/route103-runner.cjs"],
      },
    });
    const bridge = createBrowserCliExecutionBridge(
      loadBrowserCliExecutorInjectionFromEnv({
        env: { [BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV]: "/tmp/external-runner.json" },
        readFile: () => serializeBrowserExternalRunnerManifest(manifest),
      }),
    );

    expect(bridge.browserExecutor?.kind).toBe("external-runner");
    expect(bridge.browserSandboxAuthority?.mode).toBe("local-fixture");
    expect(bridge.browserCliExecutionBridgeSummary.executionMode).toBe("test-local");
    expect(bridge.browserCliExecutionBridgeSummary.evidence).toContain(
      "browser-cli-execution-bridge:external-runner-created",
    );
  });

  it("keeps skill-managed manifests as an explicit future policy boundary", async () => {
    const manifest = createBrowserExternalRunnerManifest({
      source: "skill-managed",
      runnerMode: "skill-managed",
      runnerId: "skill:browser-runner",
      runnerRef: "skill:browser-runner",
    });
    const bridge = createBrowserCliExecutionBridge(
      loadBrowserCliExecutorInjectionFromEnv({
        env: { [BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV]: "/tmp/skill-runner.json" },
        readFile: () => serializeBrowserExternalRunnerManifest(manifest),
      }),
    );

    expect(bridge.browserExecutor?.kind).toBe("external-runner");
    expect(bridge.browserCliExecutionBridgeSummary.executionMode).toBe("skill-managed");
    expect(bridge.browserCliExecutionBridgeSummary.externalRunnerStatus).toBe("future-skill-required");
  });
});
