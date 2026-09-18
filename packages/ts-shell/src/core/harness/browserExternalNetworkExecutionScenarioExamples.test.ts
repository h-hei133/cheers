import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBrowserActionContract } from "../../browser/browserActionContract.js";
import { createBrowserExecutionRequest, type BrowserExecutionRequest } from "../../browser/browserExecutionContract.js";
import { runBrowserExternalNetworkExecutionBridge } from "../../browser/browserExternalNetworkExecutionBridge.js";
import { renderBrowserExternalNetworkExecutionSurface } from "../../browser/browserExternalNetworkExecutionSurface.js";
import { runBrowserExecutionCommand } from "../../browser/browserExecutionCommandRunner.js";
import { FakeBrowserExecutor } from "../../browser/browserExecutor.js";
import { createBrowserNetworkAllowlist } from "../../browser/browserNetworkAllowlist.js";
import { createBrowserSandboxAuthority } from "../../browser/browserSandboxAuthority.js";
import { agentCliAssertionFailures } from "./agentCliScenarioAssertions.js";
import { renderAgentCliScenarioReport } from "./agentCliScenarioReport.js";
import { runAgentCliScenario } from "./agentCliScenarioRunner.js";
import type { AgentCliScenario } from "./agentCliScenarioModel.js";

describe("browser external-network execution bridge scenario examples", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("blocks external URL execution with no allowlist", () => {
    const result = bridge(request("navigate", "https://example.com"), {
      confirmations: [{ kind: "network", status: "confirmed" }],
    });

    expect(result.receipt.allowlistStatus).toBe("blocked-no-allowlist");
    expect(result.receipt.executed).toBe(false);
    expect(renderBrowserExternalNetworkExecutionSurface(result)).toContain("Network access: none");
  });

  it("blocks allowlisted external URL without confirmation", () => {
    const result = bridge(request("navigate", "https://example.com"), {
      networkAllowlist: createBrowserNetworkAllowlist({
        allowedOrigins: [{ origin: "https://example.com", mode: "future-runtime" }],
      }),
    });

    expect(result.receipt.allowlistStatus).toBe("allowed");
    expect(result.receipt.confirmationStatus).toBe("required");
    expect(result.status).toBe("blocked");
  });

  it("reports ready-for-future-runner with represented gates but still Executed:no", () => {
    const result = bridge(request("navigate", "https://example.com"), {
      networkAllowlist: createBrowserNetworkAllowlist({
        allowedOrigins: [{ origin: "https://example.com", mode: "future-runtime" }],
      }),
      confirmations: [{ kind: "network", status: "confirmed" }],
      runnerMode: "future-runner",
    });

    expect(result.status).toBe("ready-for-future-runner");
    expect(result.mode).toBe("ready-for-future-runner");
    expect(result.receipt.executed).toBe(false);
    expect(renderBrowserExternalNetworkExecutionSurface(result)).toContain("Executed: no");
  });

  it("keeps complete gates blocked when the external runner is disabled", () => {
    const result = bridge(request("navigate", "https://example.com"), {
      networkAllowlist: createBrowserNetworkAllowlist({
        allowedOrigins: [{ origin: "https://example.com", mode: "future-runtime" }],
      }),
      confirmations: [{ kind: "network", status: "confirmed" }],
    });

    expect(result.receipt.externalRunnerStatus).toBe("blocked-runner-disabled");
    expect(result.receipt.executed).toBe(false);
  });

  it("redacts credential URLs and blocks unsupported/private targets", () => {
    const credential = bridge(request("navigate", "https://user:pass@example.com"), {
      confirmations: [{ kind: "network", status: "confirmed" }],
    });
    const credentialOutput = renderBrowserExternalNetworkExecutionSurface(credential);
    expect(credential.receipt.allowlistStatus).toBe("blocked-credential-url");
    expect(credential.receipt.redactions).toContain("url-credentials");
    expect(credentialOutput).not.toContain("user:pass");

    const unsupported = bridge(request("navigate", "ftp://example.com"), {
      confirmations: [{ kind: "network", status: "confirmed" }],
    });
    expect(unsupported.receipt.allowlistStatus).toBe("blocked-scheme");

    const privateNetwork = bridge(request("navigate", "https://127.0.0.1"), {
      confirmations: [{ kind: "network", status: "confirmed" }],
      networkAllowlist: createBrowserNetworkAllowlist({
        allowedOrigins: [{ origin: "https://127.0.0.1", mode: "future-runtime" }],
      }),
    });
    expect(privateNetwork.receipt.allowlistStatus).toBe("blocked-private-network");
  });

  it("blocks sensitive external-network actions", () => {
    for (const actionKind of ["auth", "payment", "destructive", "upload", "download", "screenshot"] as const) {
      const result = bridge(request(actionKind, "https://example.com"), {
        networkAllowlist: createBrowserNetworkAllowlist({
          allowedOrigins: [{ origin: "https://example.com", mode: "future-runtime" }],
        }),
        confirmations: [{ kind: "network", status: "confirmed" }],
        runnerMode: "future-runner",
      });
      expect(result.receipt.externalRunnerStatus).toBe("blocked-sensitive-action");
      expect(result.receipt.executed).toBe(false);
    }
  });

  it("leaves local/test execution unchanged", async () => {
    const result = await runBrowserExecutionCommand({
      request: request("observe", "local-fixture://route116-demo"),
      executor: new FakeBrowserExecutor(),
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "fake-test" }),
      networkAllowlist: createBrowserNetworkAllowlist(),
    });

    expect(result.output).toContain("Browser execution");
    expect(result.output).toContain("Executed: yes");
    expect(result.output).not.toContain("External browser execution");
  });

  it("real CLI external URL remains no-network and Executed:no", async () => {
    const scenario: AgentCliScenario = {
      id: "route116-cli-external-no-network",
      name: "route116 CLI external no-network",
      metadata: { route: "116", capability: ["browser", "external-network", "real-cli"] },
      steps: [
        {
          id: "execute",
          kind: "cli-command",
          prompt: "/browser execute navigate https://example.com",
          assertions: [
            { id: "external-surface", kind: "stdout-contains", text: "External browser execution" },
            { id: "executed-no", kind: "executed-no" },
            { id: "network-none", kind: "stdout-contains", text: "Network access: none" },
            { id: "runner-disabled", kind: "stdout-contains", text: "Runner status:" },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    };
    const result = await runAgentCliScenario({
      scenario,
      projectPath: projectRoot(),
      homeDir: tempRoot("private-agents-route116-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(renderAgentCliScenarioReport(result)).toContain("externalNetwork=blocked");
  });

  function bridge(
    browserRequest: BrowserExecutionRequest,
    input: Omit<Parameters<typeof runBrowserExternalNetworkExecutionBridge>[0], "request" | "sandboxAuthority"> = {},
  ) {
    return runBrowserExternalNetworkExecutionBridge({
      request: browserRequest,
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "future-runtime" }),
      ...input,
    });
  }

  function request(
    actionKind: BrowserExecutionRequest["actionKind"],
    target: string,
  ): BrowserExecutionRequest {
    return createBrowserExecutionRequest({
      mode: "future-runtime",
      action: createBrowserActionContract({
        actionKind,
        url: actionKind === "navigate" ? target : undefined,
        target,
        userIntentSummary: `Route 116 ${actionKind} ${target}`,
        requiresNetwork: true,
        requiresAuth: actionKind === "auth",
      }),
    });
  }

  function tempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
  }

  function projectRoot(): string {
    const projectPath = tempRoot("private-agents-route116-project-");
    fs.writeFileSync(path.join(projectPath, "README.md"), "Route 116 fixture\n", "utf8");
    return projectPath;
  }
});
