import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBrowserActionContract } from "../../browser/actionContract.js";
import { createBrowserExecutionRequest, type BrowserExecutionRequest } from "../../browser/executionContract.js";
import { decideBrowserNetworkEgress } from "../../browser/networkEgressGuard.js";
import { decideBrowserRedirectPolicy } from "../../browser/redirectPolicy.js";
import { renderBrowserNetworkEgressSurface } from "../../browser/networkEgressSurface.js";
import { runBrowserExternalNetworkExecutionBridgeWithControlledNetwork } from "../../browser/externalNetworkExecutionBridge.js";
import { createBrowserControlledNetworkRunnerManifest } from "../../browser/controlledNetworkRunnerManifest.js";
import { createBrowserNetworkAllowlist } from "../../browser/networkAllowlist.js";
import { createBrowserSandboxAuthority } from "../../browser/sandboxAuthority.js";
import { agentCliAssertionFailures } from "./agentCliScenarioAssertions.js";
import { renderAgentCliScenarioReport } from "./agentCliScenarioReport.js";
import { runAgentCliScenario } from "./agentCliScenarioRunner.js";
import type { AgentCliScenario } from "./agentCliScenarioModel.js";
import { createBrowserControlledNetworkServer, type BrowserControlledNetworkServer } from "./browserControlledNetworkServer.js";
import { createBrowserControlledNetworkScenarioFixture } from "./browserControlledNetworkScenarioFixtures.js";

describe("browser network egress guard scenario examples", () => {
  const servers: BrowserControlledNetworkServer[] = [];
  const cleanupFns: (() => Promise<void>)[] = [];
  const tempRoots: string[] = [];

  afterEach(async () => {
    for (const cleanup of cleanupFns.splice(0)) {
      await cleanup();
    }
    for (const server of servers.splice(0)) {
      await server.close();
    }
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("allows controlled loopback request and generates audit record", async () => {
    const server = await serverFixture();
    const result = await controlledBridge(request("navigate", `${server.origin}/`), server.origin);

    expect(result.controlledNetworkReceipt?.egressDecision).toBe("allowed-controlled-origin");
    expect(result.controlledNetworkReceipt?.egressAuditId).toContain("browser-network-audit");
    expect(renderBrowserNetworkEgressSurface(result.controlledNetworkReceipt!.egressAudit!)).toContain("Public network: no");
  });

  it("blocks public, private non-harness, credential, and unsupported URLs", () => {
    const allowed = "http://127.0.0.1:45123";
    expect(egress("https://example.com", allowed).status).toBe("blocked-public-origin");
    expect(egress("http://127.0.0.1:45124", allowed).status).toBe("blocked-private-network");
    const credential = egress("http://user:pass@127.0.0.1:45123", allowed);
    expect(credential.status).toBe("blocked-credential-url");
    expect(credential.redactions).toContain("url-credentials");
    expect(egress("ftp://127.0.0.1:45123", allowed).status).toBe("blocked-unsupported-scheme");
  });

  it("allows same-origin redirect and blocks public redirect escape", () => {
    const allowed = "http://127.0.0.1:45123";
    const same = decideBrowserRedirectPolicy({
      request: request("navigate", `${allowed}/`),
      requestedUrl: `${allowed}/`,
      redirectTarget: `${allowed}/next`,
      allowedOrigins: [allowed],
      controlledOrigin: allowed,
      outputBudgetBytes: 2048,
    });
    expect(same.status).toBe("redirect-allowed-controlled-origin");

    const escape = decideBrowserRedirectPolicy({
      request: request("navigate", `${allowed}/`),
      requestedUrl: `${allowed}/`,
      redirectTarget: "https://example.com/",
      allowedOrigins: [allowed],
      controlledOrigin: allowed,
      outputBudgetBytes: 2048,
    });
    expect(escape.status).toBe("blocked-redirect-escape");
  });

  it("blocks output budget overflow and sensitive actions", () => {
    const allowed = "http://127.0.0.1:45123";
    expect(egress(`${allowed}/`, allowed, { observedOutputBytes: 4096, outputBudgetBytes: 100 }).status).toBe("blocked-output-budget");
    expect(egress(`${allowed}/`, allowed, { actionKind: "auth" }).status).toBe("blocked-sensitive-action");
  });

  it("real CLI controlled-network scenario includes egress audit and public network no", async () => {
    const fixture = await createBrowserControlledNetworkScenarioFixture();
    cleanupFns.push(fixture.cleanup);
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "route119-cli-project-"));
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "route119-cli-home-"));
    tempRoots.push(projectPath, homeDir);
    fs.writeFileSync(path.join(projectPath, "README.md"), "Route 119 CLI egress audit fixture.\n", "utf8");
    const scenario: AgentCliScenario = {
      id: "route119-cli-egress-audit",
      name: "route119 CLI egress audit",
      metadata: { route: "119", capability: ["browser", "egress", "audit", "real-cli"] },
      steps: [
        {
          id: "execute",
          kind: "cli-command",
          prompt: `/browser execute navigate ${fixture.server.origin}/`,
          env: fixture.env,
          assertions: [
            { id: "egress", kind: "stdout-contains", text: "Browser network egress guard" },
            { id: "audit", kind: "stdout-contains", text: "Egress audit:" },
            { id: "public-no", kind: "stdout-contains", text: "Public network: no" },
            { id: "executed", kind: "executed-yes" },
            { id: "safe-output", kind: "no-raw-content-or-secrets" },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    };

    const result = await runAgentCliScenario({
      scenario,
      projectPath,
      homeDir,
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(renderAgentCliScenarioReport(result)).toContain("egress=allowed-controlled-origin");
  });

  function egress(
    url: string,
    allowed: string,
    input: {
      readonly actionKind?: BrowserExecutionRequest["actionKind"];
      readonly observedOutputBytes?: number;
      readonly outputBudgetBytes?: number;
    } = {},
  ) {
    return decideBrowserNetworkEgress({
      request: request(input.actionKind ?? "navigate", url),
      requestedUrl: url,
      allowedOrigins: [allowed],
      controlledOrigin: allowed,
      networkMode: "controlled-only",
      outputBudgetBytes: input.outputBudgetBytes ?? 2048,
      observedOutputBytes: input.observedOutputBytes,
    });
  }

  async function controlledBridge(browserRequest: BrowserExecutionRequest, origin: string) {
    return runBrowserExternalNetworkExecutionBridgeWithControlledNetwork({
      request: browserRequest,
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "future-runtime" }),
      networkAllowlist: createBrowserNetworkAllowlist({
        allowedOrigins: [{ origin, mode: "future-runtime" }],
        allowPrivateNetworkInTest: true,
      }),
      confirmations: [{ kind: "network", status: "confirmed" }],
      controlledRunnerManifest: {
        status: "valid",
        manifest: createBrowserControlledNetworkRunnerManifest({ allowedLoopbackOrigin: origin }),
        reason: "valid controlled egress manifest",
        evidence: ["test:controlled-egress-manifest"],
        warnings: [],
        redactions: [],
      },
    });
  }

  function request(actionKind: BrowserExecutionRequest["actionKind"], target: string): BrowserExecutionRequest {
    return createBrowserExecutionRequest({
      mode: "future-runtime",
      action: createBrowserActionContract({
        actionKind,
        url: actionKind === "navigate" ? target : undefined,
        target,
        userIntentSummary: `Route 119 ${actionKind} ${target}`,
        requiresNetwork: target.startsWith("http"),
        requiresAuth: actionKind === "auth",
      }),
    });
  }

  async function serverFixture() {
    const server = await createBrowserControlledNetworkServer();
    servers.push(server);
    return server;
  }
});
