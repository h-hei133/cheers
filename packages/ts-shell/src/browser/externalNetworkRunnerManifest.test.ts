import { describe, expect, it } from "vitest";
import {
  createBrowserExternalNetworkRunnerHarnessContext,
  createBrowserExternalNetworkRunnerManifest,
  loadBrowserExternalNetworkRunnerManifestFromEnv,
  serializeBrowserExternalNetworkRunnerManifest,
  validateBrowserExternalNetworkRunnerManifest,
} from "./externalNetworkRunnerManifest.js";

describe("browser external-network runner manifest", () => {
  it("validates explicit simulated manifests and creates harness gates", () => {
    const manifest = createBrowserExternalNetworkRunnerManifest({
      allowedOrigins: ["https://example.com"],
      allowedActionKinds: ["navigate", "observe", "extract"],
    });

    const validation = validateBrowserExternalNetworkRunnerManifest(manifest);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.manifest.networkExecution).toBe(false);
      expect(validation.evidence).toContain("browser-external-network-runner-manifest:no-network-execution");
    }

    const loaded = loadBrowserExternalNetworkRunnerManifestFromEnv({
      env: { CHEERS_BROWSER_EXTERNAL_NETWORK_RUNNER_MANIFEST: "/tmp/manifest.json" },
      readFile: () => serializeBrowserExternalNetworkRunnerManifest(manifest),
    });
    expect(loaded.status).toBe("valid");
    const context = createBrowserExternalNetworkRunnerHarnessContext(loaded);
    expect(context.browserSandboxAuthority?.mode).toBe("future-runtime");
    expect(context.browserNetworkAllowlist?.allowedOrigins[0]?.origin).toBe("https://example.com");
    expect(context.browserExecutionConfirmations?.[0]?.status).toBe("confirmed");
  });

  it("rejects wildcard, credential, sensitive, and real-network manifests", () => {
    const wildcard = validateBrowserExternalNetworkRunnerManifest({
      ...createBrowserExternalNetworkRunnerManifest(),
      allowedOrigins: ["*"],
    });
    expect(wildcard.ok).toBe(false);

    const credential = validateBrowserExternalNetworkRunnerManifest({
      ...createBrowserExternalNetworkRunnerManifest(),
      allowedOrigins: ["https://user:pass@example.com"],
    });
    expect(credential.ok).toBe(false);

    const sensitive = validateBrowserExternalNetworkRunnerManifest({
      ...createBrowserExternalNetworkRunnerManifest(),
      allowedActionKinds: ["navigate", "screenshot"],
    });
    expect(sensitive.ok).toBe(false);

    const realNetwork = validateBrowserExternalNetworkRunnerManifest({
      ...createBrowserExternalNetworkRunnerManifest(),
      networkExecution: true,
    });
    expect(realNetwork.ok).toBe(false);
  });
});
