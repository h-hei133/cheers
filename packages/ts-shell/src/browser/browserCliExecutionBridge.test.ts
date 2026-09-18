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
} from "./runtime/external/manifest.js";
import {
  createBrowserLocalFixtureManifest,
  serializeBrowserLocalFixtureManifest,
} from "./browserLocalFixtureManifest.js";
import { createBrowserSkillRunnerMetadata } from "./skill/runner/metadata.js";
import { createBrowserSkillRunnerBinding } from "./skill/runner/binding.js";

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

  it("keeps skill-managed manifests without metadata as an explicit future policy boundary", async () => {
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

    expect(bridge.browserExecutor).toBeUndefined();
    expect(bridge.browserCliExecutionBridgeSummary.executionMode).toBe("skill-managed");
    expect(bridge.browserCliExecutionBridgeSummary.externalRunnerStatus).toBe("future-skill-required");
  });

  it("loads valid skill runner metadata while keeping execution unavailable", async () => {
    const manifest = createBrowserExternalRunnerManifest({
      source: "skill-managed",
      runnerMode: "skill-managed",
      runnerId: "skill:browser-runner",
      runnerRef: "skill:browser-runner",
      skillRunnerMetadata: createBrowserSkillRunnerMetadata({
        runnerId: "skill:browser-runner",
        skillId: "skill:browser-runner",
        actions: ["observe", "extract"],
      }),
    });
    const bridge = createBrowserCliExecutionBridge(
      loadBrowserCliExecutorInjectionFromEnv({
        env: { [BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV]: "/tmp/skill-runner.json" },
        readFile: () => serializeBrowserExternalRunnerManifest(manifest),
      }),
    );

    expect(bridge.browserExecutor).toBeUndefined();
    expect(bridge.browserCliExecutionBridgeSummary.skillRunnerReadiness?.status).toBe(
      "future-execution-required",
    );
    expect(bridge.browserCliExecutionBridgeSummary.externalRunnerStatus).toBe("future-execution-required");
    expect(bridge.browserCliExecutionBridgeSummary.evidence).toContain(
      "browser-cli-execution-bridge:no-skill-execution",
    );
  });

  it("constructs a skill execution executor only for explicit skill binding", async () => {
    const metadata = createBrowserSkillRunnerMetadata({
      runnerId: "skill:browser-runner",
      skillId: "skill:browser-runner",
    });
    const manifest = createBrowserExternalRunnerManifest({
      source: "skill-managed",
      runnerMode: "skill-managed",
      runnerId: "skill:browser-runner",
      runnerRef: "skill:browser-runner",
      skillRunnerMetadata: metadata,
      skillRunnerBinding: createBrowserSkillRunnerBinding({
        metadata,
        runnerCommand: {
          command: process.execPath,
          args: ["/tmp/route106-skill-runner.cjs"],
        },
      }),
    });
    const bridge = createBrowserCliExecutionBridge(
      loadBrowserCliExecutorInjectionFromEnv({
        env: { [BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV]: "/tmp/skill-runner.json" },
        readFile: () => serializeBrowserExternalRunnerManifest(manifest),
      }),
    );

    expect(bridge.browserExecutor?.kind).toBe("skill-runner");
    expect(bridge.browserCliExecutionBridgeSummary.externalRunnerStatus).toBe("allowed");
    expect(bridge.browserCliExecutionBridgeSummary.skillRunnerBinding?.mode).toBe("test-local-process");
    expect(bridge.browserCliExecutionBridgeSummary.evidence).toContain(
      "browser-cli-execution-bridge:skill-runner-created",
    );
  });
});
