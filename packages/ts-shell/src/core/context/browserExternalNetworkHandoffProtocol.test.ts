import { describe, expect, it } from "vitest";
import { createBrowserActionContract } from "./browserActionContract.js";
import { createBrowserExecutionRequest } from "./browserExecutionContract.js";
import { runBrowserExternalNetworkExecutionBridge } from "./browserExternalNetworkExecutionBridge.js";
import { validateBrowserExternalNetworkHandoffResponse } from "./browserExternalNetworkHandoffProtocol.js";
import { createBrowserExternalNetworkRunnerManifest } from "./browserExternalNetworkRunnerManifest.js";
import { createBrowserNetworkAllowlist } from "./browserNetworkAllowlist.js";
import { createBrowserSandboxAuthority } from "./browserSandboxAuthority.js";

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
