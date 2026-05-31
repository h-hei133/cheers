import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBrowserCommandArgs } from "./browserCommandContract.js";
import { runBrowserCommandAsync } from "./browserCommandRunner.js";
import { createBrowserPlaywrightCliPlan } from "./browserPlaywrightCliAdapter.js";
import { FakeBrowserExecutor, NOOP_BROWSER_EXECUTOR } from "./browserExecutor.js";
import { decideBrowserExecutionPolicy } from "./browserExecutionPolicy.js";
import { createBrowserSandboxAuthority } from "./browserSandboxAuthority.js";
import { BrowserPlaywrightCliLocalFixtureExecutor } from "./browserPlaywrightCliExecutor.js";
import { createBrowserPlaywrightAvailability } from "./browserPlaywrightAvailability.js";
import { BrowserPlaywrightLocalExecutor } from "./browserPlaywrightLocalExecutor.js";
import { createBrowserNetworkAllowlist } from "./browserNetworkAllowlist.js";
import { createBrowserReceiptCacheManifest } from "./browser/receipt/browserReceiptCacheManifest.js";
import { createBrowserReceiptCacheStore } from "./browser/receipt/browserReceiptCacheStore.js";

describe("browser execution command runner", () => {
  it("blocks /browser execute without an injected executor", async () => {
    const parsed = parseBrowserCommandArgs(["execute", "navigate", "https://example.com"]);
    const result = await runBrowserCommandAsync({ contract: parsed.contract! });

    expect(result.output).toContain("External browser execution");
    expect(result.output).toContain("- Runner status:");
    expect(result.output).toContain("- Executed: no");
    expect(result.output).toContain("- Browser process: not launched");
    expect(result.output).toContain("- Network access: none");
    expect(result.output).toContain("- Provider/model call: none");
    expect(result.output).toContain("- MCP discovery/launch: none");
    expect(result.evidence).toContain("browser-execution-command-runner:no-mcp-launch");
  });

  it("runs read-only observe through the fake/test executor with deterministic evidence", async () => {
    const parsed = parseBrowserCommandArgs(["execute", "observe"]);
    const result = await runBrowserCommandAsync({
      contract: parsed.contract!,
      browserExecutor: new FakeBrowserExecutor(),
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "fake-test" }),
      now: () => "2026-05-17T01:02:03.000Z",
    });

    expect(result.output).toContain("- Outcome: executed");
    expect(result.output).toContain("- Action: observe");
    expect(result.output).toContain("- Mode: fake-test");
    expect(result.output).toContain("- Runtime: fake/test browser executor");
    expect(result.output).toContain("- Executed: yes");
    expect(result.output).toContain("timestamp=2026-05-17T01:02:03.000Z");
    expect(result.output).toContain("- Raw content: excluded");
    expect(result.output).not.toContain("Browser process: launched");
  });

  it("runs read-only observe through the local fixture executor with sanitized evidence", async () => {
    const parsed = parseBrowserCommandArgs(["execute", "observe"]);
    const result = await runBrowserCommandAsync({
      contract: parsed.contract!,
      browserExecutor: new BrowserPlaywrightCliLocalFixtureExecutor(),
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "local-fixture" }),
      now: () => "2026-05-17T04:05:06.000Z",
    });

    expect(result.output).toContain("- Outcome: executed");
    expect(result.output).toContain("- Mode: local-fixture");
    expect(result.output).toContain("- Runtime: playwright-cli local fixture executor");
    expect(result.output).toContain("- Browser process: local fixture only");
    expect(result.output).toContain("- Executed: yes");
    expect(result.output).toContain("safe title=Local fixture page");
    expect(result.output).toContain("Browser execution lifecycle");
    expect(result.output).toContain("- Raw content: excluded");
    expect(result.output).not.toContain("<html");
    expect(result.output).not.toContain("sk-");
  });

  it("writes replay-ready receipts only when an explicit persistent cache exists", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-exec-cache-"));
    try {
      const parsed = parseBrowserCommandArgs(["execute", "observe", "local-fixture://route108-demo"]);
      const store = createBrowserReceiptCacheStore({
        manifest: createBrowserReceiptCacheManifest({
          cacheRoot: root,
          allowedOperations: ["read", "write"],
        }),
      });
      const result = await runBrowserCommandAsync({
        contract: parsed.contract!,
        browserExecutor: new BrowserPlaywrightCliLocalFixtureExecutor(),
        browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "local-fixture" }),
        browserNetworkAllowlist: createBrowserNetworkAllowlist(),
        browserExecutionConfirmations: [{ kind: "sandbox", status: "confirmed" }],
        browserReceiptCacheStore: store,
      });

      expect(result.output).toContain("Browser receipt cache");
      expect(result.output).toContain("Cache write: yes");
      expect(store.health().replayableCount).toBe(1);
      expect(fs.readFileSync(path.join(root, "browser-receipt-cache.jsonl"), "utf8")).not.toContain("RAW_");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs local fixture extract without raw HTML or secrets", async () => {
    const parsed = parseBrowserCommandArgs(["execute", "extract", "headline"]);
    const result = await runBrowserCommandAsync({
      contract: parsed.contract!,
      browserExecutor: new BrowserPlaywrightCliLocalFixtureExecutor(),
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "local-fixture" }),
    });

    expect(result.output).toContain("- Outcome: executed");
    expect(result.output).toContain("Extraction summary:");
    expect(result.output).toContain("- Executed: yes");
    expect(result.output).not.toContain("<body");
    expect(result.output).not.toContain("github_pat_");
  });

  it("reports playwright-local unavailable without default browser launch", async () => {
    const parsed = parseBrowserCommandArgs(["execute", "observe"]);
    const result = await runBrowserCommandAsync({
      contract: parsed.contract!,
      browserExecutor: new BrowserPlaywrightLocalExecutor(),
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "local-fixture" }),
    });

    expect(result.output).toContain("- Outcome: skipped");
    expect(result.output).toContain("- Mode: playwright-local");
    expect(result.output).toContain("- Runtime: playwright-local unavailable");
    expect(result.output).toContain("- Executed: no");
    expect(result.output).toContain("availability=unavailable");
    expect(result.output).toContain("cleanup=not-started");
    expect(result.output).toContain("- Decision: external-runner-only");
    expect(result.output).toContain("- External runner policy: blocked-missing-config");
    expect(result.output).toContain("- MCP discovery/launch: none");
  });

  it("runs playwright-local through an injected local runner only", async () => {
    const parsed = parseBrowserCommandArgs(["execute", "extract", "headline"]);
    const result = await runBrowserCommandAsync({
      contract: parsed.contract!,
      browserExecutor: new BrowserPlaywrightLocalExecutor({
        availabilityChecker: () => createBrowserPlaywrightAvailability({
          status: "available",
          runtimeKind: "module",
        }),
        runner: () => ({
          safeExtractionSummary: "Injected local Playwright summary.",
          stdout: "<main>sk-testsecret123</main>",
          stderr: "",
        }),
      }),
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "local-fixture" }),
    });

    expect(result.output).toContain("- Outcome: executed");
    expect(result.output).toContain("- Mode: playwright-local");
    expect(result.output).toContain("- Browser process: playwright local only");
    expect(result.output).toContain("- Executed: yes");
    expect(result.output).toContain("Injected local Playwright summary.");
    expect(result.output).not.toContain("sk-testsecret123");
  });

  it("runs local fixture navigation without external network", async () => {
    const parsed = parseBrowserCommandArgs(["execute", "navigate", "local-fixture://route99"]);
    const result = await runBrowserCommandAsync({
      contract: parsed.contract!,
      browserExecutor: new BrowserPlaywrightCliLocalFixtureExecutor(),
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "local-fixture" }),
    });

    expect(result.output).toContain("- Outcome: executed");
    expect(result.output).toContain("- Action: navigate");
    expect(result.output).toContain("- Network allowlist: allowed");
    expect(result.output).toContain("- Confirmation status: not-required");
    expect(result.output).toContain("- Executed: yes");
    expect(result.evidence).toContain("browser-network-allowlist:decision:allowed");
  });

  it("blocks external navigation without external authority or allowlist", async () => {
    const parsed = parseBrowserCommandArgs(["execute", "navigate", "https://example.com"]);
    const result = await runBrowserCommandAsync({
      contract: parsed.contract!,
      browserExecutor: new BrowserPlaywrightCliLocalFixtureExecutor(),
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "local-fixture" }),
    });

    expect(result.output).toContain("- Outcome: blocked");
    expect(result.output).toContain("- Network allowlist: blocked-no-allowlist");
    expect(result.output).toContain("- Executed: no");
  });

  it("blocks sensitive and unsupported execution actions through policy", async () => {
    for (const args of [
      ["execute", "auth", "sign in"],
      ["execute", "payment", "buy"],
      ["execute", "destructive", "delete"],
      ["execute", "upload", "file"],
      ["execute", "download", "report"],
      ["execute", "screenshot", "page"],
    ]) {
      const parsed = parseBrowserCommandArgs(args);
      expect(parsed.ok).toBe(true);
      const result = await runBrowserCommandAsync({
        contract: parsed.contract!,
        browserExecutor: new FakeBrowserExecutor(),
        browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "fake-test" }),
      });
      expect(result.output).toContain("- Outcome: blocked");
      expect(result.output).toContain("- Policy decision: blocked-sensitive");
      expect(result.output).toContain("- Executed: no");
    }
  });

  it("keeps navigate gated on explicit executor and network/runtime confirmation", () => {
    const parsed = parseBrowserCommandArgs(["execute", "navigate", "https://example.com"]);
    const request = parsed.contract!.execution!;

    expect(decideBrowserExecutionPolicy({ request, executorAvailable: false }).status).toBe("blocked-no-executor");
    expect(
      decideBrowserExecutionPolicy({
        request: { ...request, mode: "fake-test" },
        executorAvailable: true,
      }).status,
    ).toBe("allowed");
    expect(
      decideBrowserExecutionPolicy({
        request: { ...request, mode: "explicit-local", approval: "network-runtime" },
        executorAvailable: true,
      }).status,
    ).toBe("allowed");
  });

  it("noop executor always blocks without executing", async () => {
    const parsed = parseBrowserCommandArgs(["execute", "extract", "headline"]);
    const result = await runBrowserCommandAsync({
      contract: parsed.contract!,
      browserExecutor: NOOP_BROWSER_EXECUTOR,
    });

    expect(result.output).toContain("- Policy decision: blocked-no-executor");
    expect(result.output).toContain("- Executed: no");
    expect(result.output).toContain("executor=not injected");
  });

  it("builds a Playwright CLI/Skills adapter plan without spawning", () => {
    const request = parseBrowserCommandArgs(["execute", "observe"]).contract!.execution!;
    const plan = createBrowserPlaywrightCliPlan(request);

    expect(plan.runtime).toBe("playwright-cli-skills");
    expect(plan.launch).toBe("not-started");
    expect(plan.expectedEvidence).toContain("accessibility snapshot summary");
    expect(plan.evidence).toContain("browser-playwright-cli-adapter:no-process-spawn");
    expect(plan.evidence).toContain("browser-playwright-cli-adapter:no-browser-launch");
    expect(plan.evidence).toContain("browser-playwright-cli-adapter:no-network");
  });
});
