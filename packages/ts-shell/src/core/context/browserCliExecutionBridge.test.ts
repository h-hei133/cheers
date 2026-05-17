import { describe, expect, it } from "vitest";
import { createBrowserCliExecutionBridge } from "./browserCliExecutionBridge.js";
import {
  BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV,
  loadBrowserCliExecutorInjectionFromEnv,
} from "./browserCliExecutorInjection.js";
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
    expect(bridge.browserCliExecutionBridgeSummary.evidence).toContain(
      "browser-cli-execution-bridge:no-playwright-process",
    );
  });
});
