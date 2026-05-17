import { describe, expect, it } from "vitest";
import { parseBrowserCommandArgs } from "./browserCommandContract.js";
import { runBrowserCommandAsync } from "./browserCommandRunner.js";
import { createBrowserPlaywrightCliPlan } from "./browserPlaywrightCliAdapter.js";
import { FakeBrowserExecutor, NOOP_BROWSER_EXECUTOR } from "./browserExecutor.js";
import { decideBrowserExecutionPolicy } from "./browserExecutionPolicy.js";
import { createBrowserSandboxAuthority } from "./browserSandboxAuthority.js";

describe("browser execution command runner", () => {
  it("blocks /browser execute without an injected executor", async () => {
    const parsed = parseBrowserCommandArgs(["execute", "navigate", "https://example.com"]);
    const result = await runBrowserCommandAsync({ contract: parsed.contract! });

    expect(result.output).toContain("Browser execution");
    expect(result.output).toContain("- Policy decision: blocked-no-executor");
    expect(result.output).toContain("- Executed: no");
    expect(result.output).toContain("- Browser process: not launched");
    expect(result.output).toContain("- MCP discovery/launch: none");
    expect(result.output).toContain("- Provider/model call: none");
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
