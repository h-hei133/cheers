import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBrowserActionContract } from "../../browser/actionContract.js";
import { createBrowserExecutionRequest, type BrowserExecutionRequest } from "../../browser/executionContract.js";
import { runBrowserExternalNetworkExecutionBridge } from "../../browser/externalNetworkExecutionBridge.js";
import { renderBrowserExternalNetworkExecutionSurface } from "../../browser/externalNetworkExecutionSurface.js";
import { createBrowserExternalNetworkRunnerManifest } from "../../browser/externalNetworkRunnerManifest.js";
import { runBrowserExecutionCommand } from "../../browser/executionCommandRunner.js";
import { FakeBrowserExecutor } from "../../browser/executor.js";
import { createBrowserNetworkAllowlist } from "../../browser/networkAllowlist.js";
import { createBrowserSandboxAuthority } from "../../browser/sandboxAuthority.js";
import { agentCliAssertionFailures } from "../../test-utils/cli/assertions.js";
import { renderAgentCliScenarioReport } from "../../test-utils/cli/report.js";
import { runAgentCliScenario } from "../../test-utils/cli/runner.js";
import type { AgentCliScenario } from "../../test-utils/cli/model.js";
import { createBrowserExternalNetworkHandoffManifestFixture } from "./browserExternalNetworkHandoffScenarioFixtures.js";

describe("browser external-network handoff scenario examples", () => {
  const tempRoots: string[] = [];
  const cleanupFns: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanupFns.splice(0)) {
      cleanup();
    }
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("blocks with no allowlist", () => {
    const result = bridge(request("navigate", "https://example.com"), {
      confirmations: [{ kind: "network", status: "confirmed" }],
      runnerManifest: validManifestLoad(),
    });

    expect(result.status).toBe("blocked");
    expect(result.handoffPolicy?.status).toBe("blocked-no-allowlist");
    expect(result.handoffReceipt).toBeUndefined();
  });

  it("blocks allowlisted external URL without confirmation", () => {
    const result = bridge(request("navigate", "https://example.com"), {
      networkAllowlist: allowlist(),
      runnerManifest: validManifestLoad(),
    });

    expect(result.status).toBe("blocked");
    expect(result.handoffPolicy?.status).toBe("blocked-no-confirmation");
  });

  it("keeps complete gates blocked without a runner manifest", () => {
    const result = bridge(request("navigate", "https://example.com"), {
      networkAllowlist: allowlist(),
      confirmations: [{ kind: "network", status: "confirmed" }],
    });

    expect(result.handoffPolicy?.status).toBe("blocked-no-runner-manifest");
    expect(renderBrowserExternalNetworkExecutionSurface(result)).toContain("Runner manifest: missing");
  });

  it("blocks when the explicit external-network runner is disabled", () => {
    const result = bridge(request("navigate", "https://example.com"), {
      networkAllowlist: allowlist(),
      confirmations: [{ kind: "network", status: "confirmed" }],
      runnerManifest: validManifestLoad({
        runnerMode: "disabled",
      }),
    });

    expect(result.handoffPolicy?.status).toBe("blocked-runner-disabled");
    expect(result.status).toBe("blocked");
  });

  it("simulates navigate, observe, and extract handoff with complete gates and real network execution no", () => {
    for (const actionKind of ["navigate", "observe", "extract"] as const) {
      const result = bridge(request(actionKind, "https://example.com"), {
        networkAllowlist: allowlist(),
        confirmations: actionKind === "navigate" ? [{ kind: "network", status: "confirmed" }] : [],
        runnerManifest: validManifestLoad(),
      });
      const output = renderBrowserExternalNetworkExecutionSurface(result);

      expect(result.status).toBe("simulated-handoff");
      expect(result.handoffReceipt?.actionKind).toBe(actionKind);
      expect(result.handoffReceipt?.handoffStatus).toBe("simulated");
      expect(output).toContain("External browser runner handoff");
      expect(output).toContain("Real network execution: no");
      expect(output).toContain("Browser launched: no");
      expect(output).not.toContain("user:pass");
    }
  });

  it("blocks credential URLs and redacts them", () => {
    const result = bridge(request("navigate", "https://user:pass@example.com"), {
      networkAllowlist: allowlist(),
      confirmations: [{ kind: "network", status: "confirmed" }],
      runnerManifest: validManifestLoad(),
    });
    const output = renderBrowserExternalNetworkExecutionSurface(result);

    expect(result.handoffPolicy?.status).toBe("blocked-unsafe-url");
    expect(result.receipt.redactions).toContain("url-credentials");
    expect(output).not.toContain("user:pass");
  });

  it("blocks unsupported and private URLs", () => {
    const unsupported = bridge(request("navigate", "ftp://example.com"), {
      confirmations: [{ kind: "network", status: "confirmed" }],
      runnerManifest: validManifestLoad(),
    });
    expect(unsupported.handoffPolicy?.status).toBe("blocked-unsafe-url");

    const privateUrl = bridge(request("navigate", "https://127.0.0.1"), {
      networkAllowlist: createBrowserNetworkAllowlist({
        allowedOrigins: [{ origin: "https://127.0.0.1", mode: "future-runtime" }],
      }),
      confirmations: [{ kind: "network", status: "confirmed" }],
      runnerManifest: validManifestLoad({ allowedOrigins: ["https://127.0.0.1"] }),
    });
    expect(privateUrl.handoffPolicy?.status).toBe("blocked-unsafe-url");
  });

  it("blocks sensitive actions", () => {
    for (const actionKind of ["auth", "payment", "destructive", "upload", "download", "screenshot"] as const) {
      const result = bridge(request(actionKind, "https://example.com"), {
        networkAllowlist: allowlist(),
        confirmations: [{ kind: "network", status: "confirmed" }],
        runnerManifest: validManifestLoad(),
      });
      expect(result.handoffPolicy?.status).toBe("blocked-sensitive-action");
      expect(result.handoffReceipt).toBeUndefined();
    }
  });

  it("blocks invalid runner manifests without exposing raw manifest content", () => {
    const result = bridge(request("navigate", "https://example.com"), {
      networkAllowlist: allowlist(),
      confirmations: [{ kind: "network", status: "confirmed" }],
      runnerManifest: {
        status: "invalid",
        reason: "networkExecution true is unsafe sk-testsecret123",
        evidence: ["invalid-manifest-fixture"],
        warnings: ["blocked"],
        redactions: ["manifest-content"],
      },
    });
    const output = renderBrowserExternalNetworkExecutionSurface(result);

    expect(result.runnerManifestStatus).toBe("invalid");
    expect(result.handoffPolicy?.status).toBe("blocked-no-runner-manifest");
    expect(output).toContain("Runner manifest: invalid");
    expect(output).not.toContain("sk-testsecret123");
  });

  it("leaves local/test execution unchanged", async () => {
    const result = await runBrowserExecutionCommand({
      request: request("observe", "local-fixture://route117-demo"),
      executor: new FakeBrowserExecutor(),
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "fake-test" }),
      networkAllowlist: createBrowserNetworkAllowlist(),
      externalNetworkRunnerManifest: validManifestLoad(),
    });

    expect(result.output).toContain("Browser execution");
    expect(result.output).toContain("Executed: yes");
    expect(result.output).not.toContain("External browser runner handoff");
  });

  it("real CLI scenario simulates handoff and says real network execution no", async () => {
    const fixture = createBrowserExternalNetworkHandoffManifestFixture();
    cleanupFns.push(fixture.cleanup);
    const scenario: AgentCliScenario = {
      id: "route117-cli-simulated-external-network-handoff",
      name: "route117 CLI simulated external-network handoff",
      metadata: { route: "117", capability: ["browser", "external-network", "handoff", "real-cli"] },
      steps: [
        {
          id: "execute",
          kind: "cli-command",
          prompt: "/browser execute navigate https://example.com",
          env: fixture.env,
          assertions: [
            { id: "handoff", kind: "stdout-contains", text: "External browser runner handoff" },
            { id: "real-network-no", kind: "stdout-contains", text: "Real network execution: no" },
            { id: "browser-launched-no", kind: "stdout-contains", text: "Browser launched: no" },
            { id: "executed-no", kind: "executed-no" },
            { id: "safe-output", kind: "no-raw-content-or-secrets" },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    };

    const result = await runAgentCliScenario({
      scenario,
      projectPath: projectRoot(),
      homeDir: tempRoot("cheers-route117-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(renderAgentCliScenarioReport(result)).toContain("externalNetwork=simulated-handoff");
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
        extractionGoal: actionKind === "extract" ? target : undefined,
        userIntentSummary: `Route 117 ${actionKind} ${target}`,
        requiresNetwork: target.startsWith("http"),
        requiresAuth: actionKind === "auth",
      }),
    });
  }

  function allowlist() {
    return createBrowserNetworkAllowlist({
      allowedOrigins: [{ origin: "https://example.com", mode: "future-runtime" }],
    });
  }

  function validManifestLoad(
    input: Parameters<typeof createBrowserExternalNetworkRunnerManifest>[0] = {},
  ) {
    return {
      status: "valid" as const,
      manifest: createBrowserExternalNetworkRunnerManifest(input),
      reason: "valid test manifest",
      evidence: ["test:valid-external-network-runner-manifest"],
      warnings: [],
      redactions: [],
    };
  }

  function tempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
  }

  function projectRoot(): string {
    const projectPath = tempRoot("cheers-route117-project-");
    fs.writeFileSync(path.join(projectPath, "README.md"), "Route 117 fixture\n", "utf8");
    return projectPath;
  }
});
