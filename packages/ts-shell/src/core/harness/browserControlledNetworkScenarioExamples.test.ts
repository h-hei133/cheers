import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBrowserActionContract } from "../../browser/actionContract.js";
import { createBrowserExecutionRequest, type BrowserExecutionRequest } from "../../browser/executionContract.js";
import { runBrowserExternalNetworkExecutionBridgeWithControlledNetwork } from "../../browser/externalNetworkExecutionBridge.js";
import { renderBrowserExternalNetworkExecutionSurface } from "../../browser/externalNetworkExecutionSurface.js";
import { createBrowserControlledNetworkRunnerManifest } from "../../browser/controlledNetworkRunnerManifest.js";
import { createBrowserNetworkAllowlist } from "../../browser/networkAllowlist.js";
import { createBrowserSandboxAuthority } from "../../browser/sandboxAuthority.js";
import { agentCliAssertionFailures } from "../../test-utils/cli/assertions.js";
import { renderAgentCliScenarioReport } from "../../test-utils/cli/report.js";
import { runAgentCliScenario } from "../../test-utils/cli/runner.js";
import type { AgentCliScenario } from "../../test-utils/cli/model.js";
import { createBrowserControlledNetworkScenarioFixture } from "./browserControlledNetworkScenarioFixtures.js";
import { createBrowserControlledNetworkServer, type BrowserControlledNetworkServer } from "./browserControlledNetworkServer.js";

describe("browser controlled-network scenario examples", () => {
  const tempRoots: string[] = [];
  const servers: BrowserControlledNetworkServer[] = [];
  const cleanupFns: (() => Promise<void>)[] = [];

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

  it("keeps public URL blocked and not controlled-network executed", async () => {
    const server = await serverFixture();
    const result = await bridge(request("navigate", "https://example.com"), {
      origin: server.origin,
      confirmations: [{ kind: "network", status: "confirmed" }],
    });

    expect(result.status).toBe("blocked");
    expect(result.controlledNetworkPolicy?.status).toBe("blocked-origin-mismatch");
    expect(result.controlledNetworkReceipt).toBeUndefined();
  });

  it("blocks controlled loopback origin without manifest", async () => {
    const server = await serverFixture();
    const result = await bridge(request("navigate", `${server.origin}/`), {
      origin: server.origin,
      manifest: missingManifestLoad(),
      confirmations: [{ kind: "network", status: "confirmed" }],
    });

    expect(result.status).toBe("blocked");
    expect(result.controlledNetworkPolicy?.status).toBe("blocked-no-controlled-manifest");
  });

  it("blocks controlled loopback origin with manifest but no confirmation", async () => {
    const server = await serverFixture();
    const result = await bridge(request("navigate", `${server.origin}/`), {
      origin: server.origin,
      confirmations: [],
    });

    expect(result.status).toBe("blocked");
    expect(result.controlledNetworkPolicy?.status).toBe("blocked-no-confirmation");
    expect(server.requests).toEqual([]);
  });

  it("executes controlled loopback request with complete gates", async () => {
    const server = await serverFixture();
    const result = await bridge(request("navigate", `${server.origin}/`), {
      origin: server.origin,
      confirmations: [{ kind: "network", status: "confirmed" }],
    });
    const output = renderBrowserExternalNetworkExecutionSurface(result);

    expect(result.status).toBe("controlled-network-executed");
    expect(server.runId).toBe("controlled-network-harness");
    expect(createBrowserControlledNetworkRunnerManifest({ allowedLoopbackOrigin: server.origin }).runId).toBe("controlled-network-harness");
    expect(result.controlledNetworkReceipt?.safeSummary).not.toContain("route118");
    expect(result.controlledNetworkReceipt?.executed).toBe(true);
    expect(result.controlledNetworkReceipt?.publicNetwork).toBe(false);
    expect(output).toContain("Controlled browser network execution");
    expect(output).toContain("Public network: no");
    expect(output).toContain("Browser launched: no");
    expect(server.requests).toContain("/");
  });

  it("observes and extracts sanitized controlled evidence", async () => {
    const server = await serverFixture();
    for (const [actionKind, target] of [
      ["observe", `${server.origin}/`],
      ["extract", `${server.origin}/extract`],
    ] as const) {
      const result = await bridge(request(actionKind, target), {
        origin: server.origin,
        confirmations: [],
      });
      expect(result.status).toBe("controlled-network-executed");
      expect(result.controlledNetworkReceipt?.safeSummary).toContain("controlled");
      expect(renderBrowserExternalNetworkExecutionSurface(result)).not.toContain("<main>");
      expect(renderBrowserExternalNetworkExecutionSurface(result)).not.toContain("sk-");
    }
  });

  it("blocks redirects to public origins", async () => {
    const server = await serverFixture();
    const result = await bridge(request("navigate", `${server.origin}/redirect-public`), {
      origin: server.origin,
      confirmations: [{ kind: "network", status: "confirmed" }],
    });

    expect(result.status).toBe("blocked");
    expect(result.controlledNetworkReceipt?.requestStatus).toBe("redirect-blocked");
    expect(result.controlledNetworkReceipt?.executed).toBe(false);
  });

  it("redacts and blocks credential URLs", async () => {
    const server = await serverFixture();
    const result = await bridge(request("navigate", `http://user:pass@127.0.0.1:${new URL(server.origin).port}/`), {
      origin: server.origin,
      confirmations: [{ kind: "network", status: "confirmed" }],
    });
    const output = renderBrowserExternalNetworkExecutionSurface(result);

    expect(result.controlledNetworkPolicy?.status).toBe("blocked-unsafe-url");
    expect(output).not.toContain("user:pass");
  });

  it("handles timeout safely", async () => {
    const server = await serverFixture();
    const result = await bridge(request("navigate", `${server.origin}/slow`), {
      origin: server.origin,
      timeoutMs: 50,
      confirmations: [{ kind: "network", status: "confirmed" }],
    });

    expect(result.status).toBe("blocked");
    expect(result.controlledNetworkReceipt?.requestStatus).toBe("timeout");
    expect(result.controlledNetworkReceipt?.executed).toBe(false);
  });

  it("blocks sensitive actions", async () => {
    const server = await serverFixture();
    for (const actionKind of ["auth", "payment", "destructive", "upload", "download", "screenshot"] as const) {
      const result = await bridge(request(actionKind, `${server.origin}/`), {
        origin: server.origin,
        confirmations: [{ kind: "network", status: "confirmed" }],
      });
      expect(result.controlledNetworkPolicy?.status).toBe("blocked-sensitive-action");
      expect(result.controlledNetworkReceipt).toBeUndefined();
    }
  });

  it("real CLI scenario uses controlled server and confirms public network no", async () => {
    const fixture = await createBrowserControlledNetworkScenarioFixture();
    cleanupFns.push(fixture.cleanup);
    const scenario: AgentCliScenario = {
      id: "route118-cli-controlled-network",
      name: "route118 CLI controlled network",
      metadata: { route: "118", capability: ["browser", "controlled-network", "real-cli"] },
      steps: [
        {
          id: "execute",
          kind: "cli-command",
          prompt: `/browser execute navigate ${fixture.server.origin}/`,
          env: fixture.env,
          assertions: [
            { id: "controlled", kind: "stdout-contains", text: "Controlled browser network execution" },
            { id: "public-no", kind: "stdout-contains", text: "Public network: no" },
            { id: "browser-no", kind: "stdout-contains", text: "Browser launched: no" },
            { id: "executed-yes", kind: "executed-yes" },
            { id: "safe-output", kind: "no-raw-content-or-secrets" },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    };

    const result = await runAgentCliScenario({
      scenario,
      projectPath: projectRoot(),
      homeDir: tempRoot("cheers-route118-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(renderAgentCliScenarioReport(result)).toContain("controlledNetwork=executed");
    expect(fixture.server.requests).toContain("/");
  });

  async function bridge(
    browserRequest: BrowserExecutionRequest,
    input: {
      readonly origin: string;
      readonly manifest?: ReturnType<typeof controlledManifestLoad>;
      readonly timeoutMs?: number;
      readonly confirmations?: Parameters<typeof runBrowserExternalNetworkExecutionBridgeWithControlledNetwork>[0]["confirmations"];
    },
  ) {
    const manifest = input.manifest === undefined
      ? controlledManifestLoad(input.origin, input.timeoutMs)
      : input.manifest;
    return runBrowserExternalNetworkExecutionBridgeWithControlledNetwork({
      request: browserRequest,
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "future-runtime" }),
      networkAllowlist: createBrowserNetworkAllowlist({
        allowedOrigins: [{ origin: input.origin, mode: "future-runtime" }],
        allowPrivateNetworkInTest: true,
      }),
      confirmations: input.confirmations,
      controlledRunnerManifest: manifest,
    });
  }

  function controlledManifestLoad(origin: string, timeoutMs?: number) {
    return {
      status: "valid" as const,
      manifest: createBrowserControlledNetworkRunnerManifest({
        allowedLoopbackOrigin: origin,
        timeoutMs,
      }),
      reason: "valid controlled test manifest",
      evidence: ["test:valid-controlled-network-manifest"],
      warnings: [],
      redactions: [],
    };
  }

  function missingManifestLoad() {
    return {
      status: "missing" as const,
      reason: "missing controlled test manifest",
      evidence: ["test:missing-controlled-network-manifest"],
      warnings: [],
      redactions: [],
    };
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
        userIntentSummary: `Controlled network ${actionKind} ${target}`,
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

  function tempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
  }

  function projectRoot(): string {
    const projectPath = tempRoot("cheers-route118-project-");
    fs.writeFileSync(path.join(projectPath, "README.md"), "Route 118 fixture\n", "utf8");
    return projectPath;
  }
});
