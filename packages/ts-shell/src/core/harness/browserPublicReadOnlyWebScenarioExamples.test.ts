import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBrowserActionContract } from "../context/browserActionContract.js";
import { parseBrowserCommandArgs } from "../context/browserCommandContract.js";
import { runBrowserCommandAsync } from "../context/browserCommandRunner.js";
import { createBrowserExecutionRequest, type BrowserExecutionRequest } from "../context/browserExecutionContract.js";
import { createBrowserNetworkAllowlist } from "../context/browserNetworkAllowlist.js";
import { createBrowserSandboxAuthority } from "../context/browserSandboxAuthority.js";
import {
  createBrowserPublicReadOnlyWebManifest,
  validateBrowserPublicReadOnlyWebManifest,
  type BrowserPublicReadOnlyWebManifestLoadResult,
} from "../context/browserPublicReadOnlyWebManifest.js";
import { decideBrowserPublicReadOnlyWebPolicy } from "../context/browserPublicReadOnlyWebPolicy.js";
import { runBrowserPublicReadOnlyWebExecutor } from "../context/browserPublicReadOnlyWebExecutor.js";
import { createBrowserPublicReadOnlyWebReceipt } from "../context/browserPublicReadOnlyWebReceipt.js";
import { renderBrowserPublicReadOnlyWebSurface } from "../context/browserPublicReadOnlyWebSurface.js";
import { runBrowserExternalNetworkExecutionBridgeWithControlledNetwork } from "../context/browserExternalNetworkExecutionBridge.js";
import { createBrowserControlledNetworkRunnerManifest } from "../context/browserControlledNetworkRunnerManifest.js";
import { createBrowserControlledNetworkServer, type BrowserControlledNetworkServer } from "./browserControlledNetworkServer.js";
import { agentCliAssertionFailures } from "./agentCliScenarioAssertions.js";
import { renderAgentCliScenarioReport } from "./agentCliScenarioReport.js";
import { runAgentCliScenario } from "./agentCliScenarioRunner.js";
import type { AgentCliScenario } from "./agentCliScenarioModel.js";
import { createBrowserPublicReadOnlyWebScenarioFixture } from "./browserPublicReadOnlyWebScenarioFixtures.js";

describe("browser public read-only web scenario examples", () => {
  const cleanupFns: (() => void | Promise<void>)[] = [];
  const tempRoots: string[] = [];
  const servers: BrowserControlledNetworkServer[] = [];

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

  it("blocks missing manifest and missing confirmation without a network call", async () => {
    const request = browserRequest("navigate", "https://example.test/");
    expect(decideBrowserPublicReadOnlyWebPolicy({
      request,
      manifestLoad: { status: "missing", reason: "missing", evidence: [], warnings: [], redactions: [] },
      confirmations: [{ kind: "network", status: "confirmed" }],
      clientAvailable: true,
    }).status).toBe("blocked-no-manifest");

    const fixture = fixtureFor();
    const policy = decideBrowserPublicReadOnlyWebPolicy({
      request,
      manifestLoad: manifestLoad(fixture.manifest),
      confirmations: [],
      clientAvailable: true,
    });
    const executor = await runBrowserPublicReadOnlyWebExecutor({
      request,
      policy,
      manifest: fixture.manifest,
      httpClient: fixture.httpClient,
    });
    expect(policy.status).toBe("blocked-no-confirmation");
    expect(executor.executed).toBe(false);
    expect(fixture.requests).toEqual([]);
  });

  it("rejects unsafe manifest shape and explicit unavailable/expired gates", () => {
    const manifest = createBrowserPublicReadOnlyWebManifest({ allowedPublicOrigins: ["https://example.test"] });
    expect(validateBrowserPublicReadOnlyWebManifest({
      ...manifest,
      allowedPublicOrigins: ["*"],
    }).status).toBe("invalid");
    expect(validateBrowserPublicReadOnlyWebManifest({
      ...manifest,
      allowedMethods: ["POST"],
    }).status).toBe("invalid");
    expect(validateBrowserPublicReadOnlyWebManifest({
      ...manifest,
      allowedPublicOrigins: ["https://user:pass@example.test"],
    }).redactions).toContain("url-credentials");

    const request = browserRequest("navigate", "https://example.test/");
    expect(decideBrowserPublicReadOnlyWebPolicy({
      request,
      manifestLoad: manifestLoad(manifest),
      confirmations: [{ kind: "network", status: "expired" }],
      clientAvailable: true,
    }).status).toBe("blocked-expired-confirmation");
    expect(decideBrowserPublicReadOnlyWebPolicy({
      request,
      manifestLoad: manifestLoad(manifest),
      confirmations: [{ kind: "network", status: "confirmed" }],
      clientAvailable: false,
    }).status).toBe("blocked-client-unavailable");
  });

  it("executes read-only GET through injected client and excludes raw body", async () => {
    const fixture = fixtureFor();
    const request = browserRequest("navigate", `${fixture.origin}/`);
    const result = await executePublicReadOnly(request, fixture);
    const surface = renderBrowserPublicReadOnlyWebSurface(result.receipt);

    expect(result.receipt.executed).toBe(true);
    expect(result.receipt.publicNetwork).toBe(true);
    expect(result.receipt.egressDecision).toBe("allowed-public-readonly-origin");
    expect(surface).toContain("Public read-only web execution");
    expect(surface).toContain("Public network: yes");
    expect(surface).toContain("Browser launched: no");
    expect(surface).toContain("JavaScript executed: no");
    expect(surface).not.toContain("<main>");
    expect(fixture.requests).toEqual([`${fixture.origin}/`]);
  });

  it("executes HEAD read-only without body evidence", async () => {
    const fixture = fixtureFor();
    const request = browserRequest("observe", `${fixture.origin}/head`);
    const result = await executePublicReadOnly(request, fixture, "HEAD");

    expect(result.receipt.executed).toBe(true);
    expect(result.receipt.method).toBe("HEAD");
    expect(result.receipt.evidenceSummary).toContain("HEAD response body excluded");
  });

  it("allows same-origin redirect and blocks non-allowlisted public redirects", async () => {
    const sameOrigin = fixtureFor({
      responses: {
        "/": { statusCode: 302, headers: { "content-type": "text/plain" }, body: "", bodyBytes: 0, redirectLocation: "/final" },
        "/final": { statusCode: 200, headers: { "content-type": "text/plain" }, body: "redirect final", bodyBytes: 14 },
      },
    });
    const allowed = await executePublicReadOnly(browserRequest("navigate", `${sameOrigin.origin}/`), sameOrigin);
    expect(allowed.receipt.executed).toBe(true);
    expect(allowed.receipt.redirectSummary).toContain(sameOrigin.origin);

    const escaped = fixtureFor({
      responses: {
        "/": { statusCode: 302, headers: { "content-type": "text/plain" }, body: "", bodyBytes: 0, redirectLocation: "https://other.test/" },
      },
    });
    const blocked = await executePublicReadOnly(browserRequest("navigate", `${escaped.origin}/`), escaped);
    expect(blocked.receipt.executed).toBe(false);
    expect(blocked.receipt.requestStatus).toBe("redirect-blocked");
    expect(blocked.receipt.egressDecision).toBe("blocked-redirect-escape");
  });

  it("blocks redirect to private and credential URLs", async () => {
    for (const redirectLocation of ["http://127.0.0.1:8123/", "https://user:pass@example.test/secret"]) {
      const fixture = fixtureFor({
        responses: {
          "/": { statusCode: 302, headers: { "content-type": "text/plain" }, body: "", bodyBytes: 0, redirectLocation },
        },
      });
      const blocked = await executePublicReadOnly(browserRequest("navigate", `${fixture.origin}/`), fixture);
      expect(blocked.receipt.executed).toBe(false);
      expect(blocked.receipt.requestStatus).toBe("redirect-blocked");
      expect(renderBrowserPublicReadOnlyWebSurface(blocked.receipt)).not.toContain("user:pass");
    }
  });

  it("blocks unsupported content type, over-budget output, credential URL, private target, and sensitive action", async () => {
    const binary = fixtureFor({
      responses: {
        "/": { statusCode: 200, headers: { "content-type": "application/octet-stream" }, body: "binary", bodyBytes: 6 },
      },
    });
    expect((await executePublicReadOnly(browserRequest("navigate", `${binary.origin}/`), binary)).receipt.requestStatus).toBe("unsafe-output");

    const budget = fixtureFor({
      responseByteBudget: 16,
      responses: {
        "/": { statusCode: 200, headers: { "content-type": "text/plain" }, body: "this response is too long", bodyBytes: 25 },
      },
    });
    expect((await executePublicReadOnly(browserRequest("navigate", `${budget.origin}/`), budget)).receipt.egressDecision).toBe("blocked-output-budget");

    expect(decideBrowserPublicReadOnlyWebPolicy({
      request: browserRequest("navigate", "https://user:pass@example.test/"),
      manifestLoad: manifestLoad(createBrowserPublicReadOnlyWebManifest({ allowedPublicOrigins: ["https://example.test"] })),
      confirmations: [{ kind: "network", status: "confirmed" }],
      clientAvailable: true,
    }).status).toBe("blocked-credential-url");
    expect(decideBrowserPublicReadOnlyWebPolicy({
      request: browserRequest("navigate", "http://127.0.0.1:8123/"),
      manifestLoad: manifestLoad(createBrowserPublicReadOnlyWebManifest({ allowedPublicOrigins: ["https://example.test"] })),
      confirmations: [{ kind: "network", status: "confirmed" }],
      clientAvailable: true,
    }).status).toBe("blocked-private-network");
    expect(decideBrowserPublicReadOnlyWebPolicy({
      request: browserRequest("navigate", "ftp://example.test/"),
      manifestLoad: manifestLoad(createBrowserPublicReadOnlyWebManifest({ allowedPublicOrigins: ["https://example.test"] })),
      confirmations: [{ kind: "network", status: "confirmed" }],
      clientAvailable: true,
    }).status).toBe("blocked-unsupported-scheme");
    expect(decideBrowserPublicReadOnlyWebPolicy({
      request: browserRequest("auth", "https://example.test/"),
      manifestLoad: manifestLoad(createBrowserPublicReadOnlyWebManifest({ allowedPublicOrigins: ["https://example.test"] })),
      confirmations: [{ kind: "network", status: "confirmed" }],
      clientAvailable: true,
    }).status).toBe("blocked-sensitive-action");
  });

  it("keeps controlled-network loopback execution unchanged", async () => {
    const server = await createBrowserControlledNetworkServer();
    servers.push(server);
    const result = await runBrowserExternalNetworkExecutionBridgeWithControlledNetwork({
      request: browserRequest("navigate", `${server.origin}/`),
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "future-runtime" }),
      networkAllowlist: createBrowserNetworkAllowlist({
        allowedOrigins: [{ origin: server.origin, mode: "future-runtime" }],
        allowPrivateNetworkInTest: true,
      }),
      confirmations: [{ kind: "network", status: "confirmed" }],
      controlledRunnerManifest: {
        status: "valid",
        manifest: createBrowserControlledNetworkRunnerManifest({ allowedLoopbackOrigin: server.origin }),
        reason: "valid controlled manifest",
        evidence: [],
        warnings: [],
        redactions: [],
      },
    });

    expect(result.status).toBe("controlled-network-executed");
    expect(result.controlledNetworkReceipt?.publicNetwork).toBe(false);
    expect(result.publicReadOnlyReceipt).toBeUndefined();
  });

  it("renders command output shape with injected deterministic client", async () => {
    const fixture = fixtureFor();
    const parsed = parseBrowserCommandArgs(["execute", "navigate", `${fixture.origin}/`]);
    const result = await runBrowserCommandAsync({
      contract: parsed.contract!,
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "future-runtime" }),
      browserNetworkAllowlist: createBrowserNetworkAllowlist({
        allowedOrigins: [{ origin: fixture.origin, mode: "future-runtime" }],
      }),
      browserExecutionConfirmations: [{ kind: "network", status: "confirmed" }],
      browserPublicReadOnlyWebManifest: manifestLoad(fixture.manifest),
      browserPublicReadOnlyHttpClient: fixture.httpClient,
    });

    expect(result.output).toContain("Public read-only web execution");
    expect(result.output).toContain("Public network: yes");
    expect(result.output).toContain("Browser launched: no");
    expect(result.output).toContain("JavaScript executed: no");
    expect(result.output).toContain("Executed: yes");
    expect(result.output).not.toContain("<main>");
  });

  it("real CLI blocked shape requires confirmation and does not make public network default", async () => {
    const fixture = fixtureFor({ confirmed: false });
    const projectPath = tempRoot("private-agents-route120-project-");
    const homeDir = tempRoot("private-agents-route120-home-");
    fs.writeFileSync(path.join(projectPath, "README.md"), "Route 120 fixture\n", "utf8");
    const scenario: AgentCliScenario = {
      id: "route120-cli-public-readonly-confirmation-required",
      name: "route120 CLI public read-only confirmation required",
      metadata: { route: "120", capability: ["browser", "public-readonly", "real-cli"] },
      steps: [
        {
          id: "execute",
          kind: "cli-command",
          prompt: `/browser execute navigate ${fixture.origin}/`,
          env: fixture.env,
          assertions: [
            { id: "public-surface", kind: "stdout-contains", text: "Public read-only web execution" },
            { id: "public-no", kind: "stdout-contains", text: "Public network: no" },
            { id: "browser-no", kind: "stdout-contains", text: "Browser launched: no" },
            { id: "js-no", kind: "stdout-contains", text: "JavaScript executed: no" },
            { id: "executed-no", kind: "executed-no" },
            { id: "safe-output", kind: "no-raw-content-or-secrets" },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    };

    const result = await runAgentCliScenario({ scenario, projectPath, homeDir });
    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(renderAgentCliScenarioReport(result)).toContain("publicReadOnly=blocked/blocked-no-confirmation");
  });

  function fixtureFor(input: Parameters<typeof createBrowserPublicReadOnlyWebScenarioFixture>[0] = {}) {
    const fixture = createBrowserPublicReadOnlyWebScenarioFixture(input);
    cleanupFns.push(fixture.cleanup);
    return fixture;
  }

  async function executePublicReadOnly(
    request: BrowserExecutionRequest,
    fixture: ReturnType<typeof createBrowserPublicReadOnlyWebScenarioFixture>,
    method: "GET" | "HEAD" = "GET",
  ) {
    const policy = decideBrowserPublicReadOnlyWebPolicy({
      request,
      manifestLoad: manifestLoad(fixture.manifest),
      confirmations: [{ kind: "network", status: "confirmed" }],
      method,
      clientAvailable: true,
    });
    const executor = await runBrowserPublicReadOnlyWebExecutor({
      request,
      policy,
      manifest: fixture.manifest,
      method,
      httpClient: fixture.httpClient,
    });
    return {
      policy,
      executor,
      receipt: createBrowserPublicReadOnlyWebReceipt({
        request,
        manifest: fixture.manifest,
        policy,
        executor,
      }),
    };
  }

  function manifestLoad(manifest: ReturnType<typeof createBrowserPublicReadOnlyWebManifest>): BrowserPublicReadOnlyWebManifestLoadResult {
    return {
      status: "valid",
      manifest,
      reason: "valid public read-only manifest",
      evidence: ["test:public-readonly-manifest"],
      warnings: [],
      redactions: [],
    };
  }

  function browserRequest(
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
        userIntentSummary: `Route 120 ${actionKind} ${target}`,
        requiresNetwork: target.startsWith("http"),
        requiresAuth: actionKind === "auth",
      }),
    });
  }

  function tempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
  }
});
