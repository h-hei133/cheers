import { afterEach, describe, expect, it } from "vitest";
import { createBrowserActionContract } from "../../../browser/actionContract.js";
import { parseBrowserCommandArgs } from "../../../browser/commandContract.js";
import { runBrowserCommandAsync } from "../../../browser/commandRunner.js";
import { createBrowserExecutionRequest, type BrowserExecutionRequest } from "../../../browser/executionContract.js";
import { createBrowserNetworkAllowlist } from "../../../browser/networkAllowlist.js";
import { createBrowserSandboxAuthority } from "../../../browser/sandboxAuthority.js";
import { createBrowserReadOnlyExtraction } from "../../../browser/readOnlyExtractionModel.js";
import { normalizeBrowserReadOnlyContent } from "../../../browser/readOnlyContentNormalizer.js";
import { classifyBrowserReadOnlyContentType } from "../../../browser/readOnlyContentType.js";
import {
  createBrowserPublicReadOnlyWebManifest,
  type BrowserPublicReadOnlyWebManifestLoadResult,
} from "../../../browser/publicReadOnlyWebManifest.js";
import { decideBrowserPublicReadOnlyWebPolicy } from "../../../browser/publicReadOnlyWebPolicy.js";
import { runBrowserPublicReadOnlyWebExecutor } from "../../../browser/publicReadOnlyWebExecutor.js";
import { createBrowserPublicReadOnlyWebReceipt } from "../../../browser/publicReadOnlyWebReceipt.js";
import { renderBrowserPublicReadOnlyWebSurface } from "../../../browser/publicReadOnlyWebSurface.js";
import { runBrowserExternalNetworkExecutionBridgeWithControlledNetwork } from "../../../browser/externalNetworkExecutionBridge.js";
import { createBrowserControlledNetworkRunnerManifest } from "../../../browser/controlledNetworkRunnerManifest.js";
import { createBrowserPublicReadOnlyWebScenarioFixture } from "../network/public/fixtures.js";
import { createBrowserControlledNetworkServer } from "../network/controlled/server.js";

describe("browser read-only extraction quality scenario examples", () => {
  const cleanupFns: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanupFns.splice(0)) {
      cleanup();
    }
  });

  it("extracts and ranks HTML title, headings, snippets, and links without fetching links", async () => {
    const body = [
      "<html><head><title>Route 122 page</title>",
      "<link rel=\"canonical\" href=\"/docs/route-122\">",
      "<meta name=\"description\" content=\"A concise public read-only extraction fixture.\"></head>",
      "<body><h1>Main heading</h1><h2>Details</h2>",
      "<main>This page explains public read-only extraction quality with enough useful text for a ranked snippet.</main>",
      "<a href=\"/next\">Next safe page</a><a href=\"https://other.example/path?token=secret\">External</a>",
      "</body></html>",
    ].join("");
    const result = await executeWithBody(body, "text/html; charset=utf-8");
    const surface = renderBrowserPublicReadOnlyWebSurface(result.receipt);

    expect(result.receipt.executed).toBe(true);
    expect(result.receipt.safeTitle).toBe("Route 122 page");
    expect(result.receipt.extractionQualitySummary).toMatch(/high|medium/);
    expect(result.receipt.rankedEvidenceSummary.join("\n")).toContain("Main heading");
    expect(result.receipt.extractionSurface?.safeLinks.join("\n")).toContain("Next safe page");
    expect(result.fixture.requests).toEqual([`${result.fixture.origin}/`]);
    expect(surface).toContain("Public read-only extraction");
    expect(surface).toContain("Extraction quality:");
    expect(surface).not.toContain("?token=secret");
  });

  it("strips script, style, noscript, comments, and unsafe markup from snippets", async () => {
    const body = [
      "<html><head><title>Safe shell</title><style>.secret{display:block}</style>",
      "<script>window.secret='RAW_SCRIPT'</script></head><body><!-- hidden comment -->",
      "<noscript>noscript payload</noscript><h1>Visible heading</h1>",
      "<p>Visible public text survives normalization for a concise extraction snippet.</p></body></html>",
    ].join("");
    const extraction = createBrowserReadOnlyExtraction({
      method: "GET",
      finalOrigin: "https://example.test",
      contentType: "text/html",
      contentTypeAllowlist: ["text/html"],
      body,
      bodyBytes: body.length,
      responseByteBudget: 4096,
    });

    expect(extraction.safeSnippets.join(" ")).toContain("Visible public text");
    expect(extraction.safeSnippets.join(" ")).not.toContain("RAW_SCRIPT");
    expect(extraction.safeSnippets.join(" ")).not.toContain("hidden comment");
    expect(extraction.safeSnippets.join(" ")).not.toContain("noscript payload");
  });

  it("summarizes plain text and JSON within a bounded normalizer budget", () => {
    const plain = createBrowserReadOnlyExtraction({
      method: "GET",
      finalOrigin: "https://example.test",
      contentType: "text/plain",
      contentTypeAllowlist: ["text/plain"],
      body: "Plain text public evidence with enough sentence content to become a safe ranked snippet.",
      bodyBytes: 82,
      responseByteBudget: 4096,
    });
    const json = createBrowserReadOnlyExtraction({
      method: "GET",
      finalOrigin: "https://example.test",
      contentType: "application/json",
      contentTypeAllowlist: ["application/json"],
      body: JSON.stringify({ title: "JSON page", items: [{ name: "alpha" }, { name: "beta" }] }),
      bodyBytes: 64,
      responseByteBudget: 4096,
    });

    expect(plain.safeSnippets[0]).toContain("Plain text public evidence");
    expect(json.normalized.normalizedText).toContain("title: JSON page");
    expect(json.normalized.normalizedText).toContain("items: array 2 items");
  });

  it("classifies binary, unsupported, and over-budget content without raw output", () => {
    expect(classifyBrowserReadOnlyContentType({
      contentType: "application/octet-stream",
      contentTypeAllowlist: ["application/octet-stream"],
      bodyBytes: 4,
      responseByteBudget: 4096,
    }).contentClass).toBe("binary-blocked");
    expect(classifyBrowserReadOnlyContentType({
      contentType: "application/xml",
      contentTypeAllowlist: ["text/html"],
      bodyBytes: 8,
      responseByteBudget: 4096,
    }).contentClass).toBe("unsupported");
    expect(classifyBrowserReadOnlyContentType({
      contentType: "text/plain",
      contentTypeAllowlist: ["text/plain"],
      bodyBytes: 8192,
      responseByteBudget: 32,
    }).contentClass).toBe("over-budget");

    const normal = normalizeBrowserReadOnlyContent({
      body: "abcdefghijklmnopqrstuvwxyz0123456789",
      byteBudget: 16,
      contentType: classifyBrowserReadOnlyContentType({
        contentType: "text/plain",
        contentTypeAllowlist: ["text/plain"],
        bodyBytes: 16,
        responseByteBudget: 16,
      }),
    });
    expect(normal.truncated).toBe(true);
    expect(normal.normalizedText.length).toBeLessThanOrEqual(19);
  });

  it("redacts secret-looking content before public read-only output is rendered", async () => {
    const result = await executeWithBody(
      "<html><head><title>Secrets</title></head><body><main>token=sk-route122secret and hidden reasoning should not appear.</main></body></html>",
      "text/html",
    );
    const surface = renderBrowserPublicReadOnlyWebSurface(result.receipt);

    expect(surface).toContain("[REDACTED_SECRET]");
    expect(surface).toContain("[REDACTED_REASONING]");
    expect(surface).not.toContain("sk-route122secret");
    expect(surface).not.toMatch(/hidden reasoning/i);
  });

  it("reports HEAD no-body extraction and redirect-safe origin in summaries", async () => {
    const fixture = createBrowserPublicReadOnlyWebScenarioFixture({
      responses: {
        "/": { statusCode: 302, headers: { "content-type": "text/plain" }, body: "", bodyBytes: 0, redirectLocation: "/final" },
        "/final": { statusCode: 200, headers: { "content-type": "text/plain" }, body: "", bodyBytes: 0 },
      },
    });
    try {
      const request = browserRequest("observe", `${fixture.origin}/`);
      const policy = decideBrowserPublicReadOnlyWebPolicy({
        request,
        manifestLoad: manifestLoad(fixture.manifest),
        confirmations: [{ kind: "network", status: "confirmed" }],
        method: "HEAD",
        clientAvailable: true,
      });
      const executor = await runBrowserPublicReadOnlyWebExecutor({
        request,
        policy,
        manifest: fixture.manifest,
        method: "HEAD",
        httpClient: fixture.httpClient,
      });
      const receipt = createBrowserPublicReadOnlyWebReceipt({ request, manifest: fixture.manifest, policy, executor });

      expect(receipt.executed).toBe(true);
      expect(receipt.evidenceSummary).toContain("HEAD response body excluded");
      expect(receipt.extractionQualitySummary).toContain("low");
      expect(receipt.redirectSummary).toContain(fixture.origin);
    } finally {
      fixture.cleanup();
    }
  });

  it("renders command output quality and leaves controlled-network execution unchanged", async () => {
    const command = await executeCommandWithFixture();
    expect(command.output).toContain("Extraction quality:");
    expect(command.output).toContain("Ranked evidence:");
    expect(command.output).not.toContain("<main>");

    const server = await createBrowserControlledNetworkServer();
    try {
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
      expect(result.publicReadOnlyReceipt).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  async function executeCommandWithFixture() {
    const body = "<html><head><title>Command Quality</title></head><body><main>Command output includes extraction quality and ranked evidence only.</main></body></html>";
    const fixture = createBrowserPublicReadOnlyWebScenarioFixture({
      responses: {
        "/": { statusCode: 200, headers: { "content-type": "text/html" }, body, bodyBytes: body.length },
      },
    });
    try {
      return await runBrowserCommandAsync({
        contract: parseBrowserCommandArgs(["execute", "navigate", `${fixture.origin}/`]).contract!,
        browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "future-runtime" }),
        browserNetworkAllowlist: createBrowserNetworkAllowlist({
          allowedOrigins: [{ origin: fixture.origin, mode: "future-runtime" }],
        }),
        browserExecutionConfirmations: [{ kind: "network", status: "confirmed" }],
        browserPublicReadOnlyWebManifest: manifestLoad(fixture.manifest),
        browserPublicReadOnlyHttpClient: fixture.httpClient,
      });
    } finally {
      fixture.cleanup();
    }
  }

  async function executeWithBody(body: string, contentType: string) {
    const fixture = createBrowserPublicReadOnlyWebScenarioFixture({
      responses: {
        "/": { statusCode: 200, headers: { "content-type": contentType }, body, bodyBytes: body.length },
      },
    });
    cleanupFns.push(fixture.cleanup);
    const request = browserRequest("navigate", `${fixture.origin}/`);
    const policy = decideBrowserPublicReadOnlyWebPolicy({
      request,
      manifestLoad: manifestLoad(fixture.manifest),
      confirmations: [{ kind: "network", status: "confirmed" }],
      clientAvailable: true,
    });
    const executor = await runBrowserPublicReadOnlyWebExecutor({
      request,
      policy,
      manifest: fixture.manifest,
      httpClient: fixture.httpClient,
    });
    return {
      fixture,
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
        userIntentSummary: `Route 122 ${actionKind} ${target}`,
        requiresNetwork: target.startsWith("http"),
        requiresAuth: false,
      }),
    });
  }
});
