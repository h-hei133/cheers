import { describe, expect, it } from "vitest";
import { createBrowserActionContract } from "./actionContract.js";
import { createBrowserExecutionRequest } from "./executionContract.js";
import { runBrowserExternalNetworkExecutionBridge } from "./externalNetworkExecutionBridge.js";
import { validateBrowserExternalNetworkHandoffResponse } from "./externalNetworkHandoffProtocol.js";
import { createBrowserExternalNetworkRunnerManifest } from "./externalNetworkRunnerManifest.js";
import { createBrowserNetworkAllowlist } from "./networkAllowlist.js";
import { createBrowserSandboxAuthority } from "./sandboxAuthority.js";

describe("browser external-network handoff protocol", () => {
  it("creates sanitized simulated handoff receipts without real network", () => {
    const result = runBrowserExternalNetworkExecutionBridge({
      request: createBrowserExecutionRequest({
        mode: "future-runtime",
        action: createBrowserActionContract({
          actionKind: "navigate",
          url: "https://example.com",
          target: "https://example.com",
          userIntentSummary: "Route 117 simulated handoff",
          requiresNetwork: true,
          requiresAuth: false,
        }),
      }),
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "future-runtime" }),
      networkAllowlist: createBrowserNetworkAllowlist({
        allowedOrigins: [{ origin: "https://example.com", mode: "future-runtime" }],
      }),
      confirmations: [{ kind: "network", status: "confirmed" }],
      runnerManifest: {
        status: "valid",
        manifest: createBrowserExternalNetworkRunnerManifest(),
        reason: "valid",
        evidence: [],
        warnings: [],
        redactions: [],
      },
    });

    expect(result.status).toBe("simulated-handoff");
    expect(result.handoffReceipt?.realNetworkExecution).toBe(false);
    expect(result.handoffReceipt?.browserLaunched).toBe(false);
    expect(result.evidence).toContain("browser-external-network-handoff-executor:no-real-network");
  });

  it("rejects unsafe simulated output", () => {
    const validation = validateBrowserExternalNetworkHandoffResponse({
      outputBudgetBytes: 4096,
      response: {
        status: "simulated",
        executed: false,
        realNetworkExecution: false,
        safeSummary: "<html>sk-testsecret123</html>",
        warnings: [],
        redactions: [],
        evidence: [],
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.response.status).toBe("invalid-response");
    expect(validation.response.safeSummary).toBeUndefined();
    expect(validation.response.redactions).toContain("unsafe-handoff-response");
  });
});
