import { describe, expect, it } from "vitest";
import { parseBrowserPreviewActionArgs } from "./browserActionContract.js";
import { classifyBrowserActionReadiness } from "./browserActionReadiness.js";
import { browserActionRiskForKind, createBrowserCapabilityState } from "./browserCapabilityModel.js";
import { browserCapabilitySidebarToolItem, renderBrowserCapabilitySurface } from "./browserCapabilitySurface.js";
import { parseBrowserCommandArgs } from "./browserCommandContract.js";
import { runBrowserCommand } from "./browserCommandRunner.js";
import { runBrowserDryRunHarness } from "./browserDryRunHarness.js";
import { decideBrowserRuntime } from "../../browser/runtime/core/decision.js";
import { classifyBrowserSandboxPolicy } from "./browserSandboxPolicy.js";

describe("browser capability command runner", () => {
  it("renders preview-only browser status without execution claims", () => {
    const state = createBrowserCapabilityState();
    const output = renderBrowserCapabilitySurface(state);

    expect(output).toContain("Browser capability status");
    expect(output).toContain("- Browser capability: preview-only");
    expect(output).toContain("- Executed: no");
    expect(output).toContain("- Browser process: not launched");
    expect(output).toContain("- MCP discovery/launch: none");
    expect(output).toContain("- Provider/model call: none");
    expect(output).toContain("Browser runtime dependency");
    expect(output).toContain("- Decision: external-runner-only");
    expect(output).toContain("- Browser execution default: disabled");
    expect(output).toContain("Playwright CLI/Skills");
    expect(output).toContain("browser tool server");
    expect(output).toContain("action-layer split");
  });

  it("parses supported previews and classifies readiness without execution", () => {
    const parsed = parseBrowserCommandArgs(["preview", "navigate", "https://example.com"]);
    expect(parsed.contract?.mode).toBe("preview");
    const result = runBrowserCommand({ contract: parsed.contract! });

    expect(result.output).toContain("Browser action preview");
    expect(result.output).toContain("- Outcome: preview-only");
    expect(result.output).toContain("- Action: navigate");
    expect(result.output).toContain("- Readiness: supported-preview");
    expect(result.output).toContain("- Executed: no");
    expect(result.output).toContain("- Browser process: not launched");
    expect(result.evidence).toContain("browser-command-runner:no-browser-execution");
  });

  it("previews extract and marks click/type as state-changing but not executed", () => {
    const extract = runBrowserCommand({
      contract: parseBrowserCommandArgs(["preview", "extract", "product", "price"]).contract!,
    });
    const click = parseBrowserPreviewActionArgs(["click", "Checkout button"]).contract!;
    const type = parseBrowserPreviewActionArgs(["type", "search", "winter jacket"]).contract!;

    expect(extract.output).toContain("- Action: extract");
    expect(extract.output).toContain("- Risk: read-only");
    expect(extract.output).toContain("- Executed: no");
    expect(browserActionRiskForKind("click")).toBe("state-changing");
    expect(browserActionRiskForKind("type")).toBe("state-changing");
    expect(click.risk).toBe("state-changing");
    expect(type.risk).toBe("state-changing");
  });

  it("blocks sensitive, destructive, future-runtime, and ambiguous previews", () => {
    const capability = createBrowserCapabilityState();
    const auth = parseBrowserPreviewActionArgs(["auth", "sign in"]).contract!;
    const payment = parseBrowserPreviewActionArgs(["payment", "buy"]).contract!;
    const destructive = parseBrowserPreviewActionArgs(["destructive", "delete account"]).contract!;
    const screenshot = parseBrowserPreviewActionArgs(["screenshot", "page"]).contract!;
    const download = parseBrowserPreviewActionArgs(["download", "report"]).contract!;
    const upload = parseBrowserPreviewActionArgs(["upload", "file"]).contract!;
    const ambiguous = parseBrowserPreviewActionArgs(["click"]).contract!;

    expect(classifyBrowserActionReadiness({ contract: auth, capability }).status).toBe("blocked-auth");
    expect(classifyBrowserActionReadiness({ contract: payment, capability }).status).toBe("blocked-payment");
    expect(classifyBrowserActionReadiness({ contract: destructive, capability }).status).toBe("blocked-destructive");
    expect(classifyBrowserActionReadiness({ contract: screenshot, capability }).status).toBe("future-runtime-required");
    expect(classifyBrowserActionReadiness({ contract: download, capability }).status).toBe("future-runtime-required");
    expect(classifyBrowserActionReadiness({ contract: upload, capability }).status).toBe("future-runtime-required");
    expect(classifyBrowserActionReadiness({ contract: ambiguous, capability }).status).toBe("blocked-ambiguous-target");
  });

  it("redacts raw content, secrets, and hidden reasoning in browser preview output", () => {
    const contract = parseBrowserPreviewActionArgs([
      "extract",
      "raw content with sk-browsersecret123 and hidden reasoning",
    ]).contract!;
    const result = runBrowserCommand({
      contract: {
        mode: "preview",
        action: contract,
      },
    });

    expect(result.output).toContain("[REDACTED_RAW_CONTENT]");
    expect(result.output).toContain("[REDACTED_SECRET]");
    expect(result.output).toContain("[REDACTED_REASONING]");
    expect(result.output).not.toContain("sk-browsersecret123");
    expect(result.output).not.toContain("hidden reasoning");
    expect(result.output).toContain("- Provider/model call: none");
    expect(result.output).toContain("- Persistence: none");
  });

  it("provides a sidebar browser placeholder without discovery", () => {
    const item = browserCapabilitySidebarToolItem();
    expect(item.label).toBe("Browser capability");
    expect(item.status).toBe("deferred");
    expect(item.summary).toContain("preview-only");
    expect(item.summary).toContain("external-runner-only");
    expect(item.summary).toContain("no browser/MCP launch");
    expect(item.evidence).toContain("browser-capability-surface:runtime-dependency-policy");
  });

  it("prefers Playwright CLI/Skills as the deterministic future runtime without launching it", () => {
    const decision = decideBrowserRuntime();

    expect(decision.recommendation.candidate).toBe("playwright-cli-skills");
    expect(decision.recommendation.reasons).toEqual(
      expect.arrayContaining(["token-efficient", "deterministic-actions", "sandboxable", "testable"]),
    );
    expect(decision.executionAvailable).toBe(false);
    expect(decision.dynamicDiscovery).toBe(false);
    expect(decision.providerCall).toBe("none");
    expect(decision.modelCall).toBe("none");
    expect(decision.evidence).toContain("browser-runtime-decision:no-runtime-launch");
  });

  it("creates non-executing dry-run plans for navigate and extract", () => {
    const navigate = runBrowserCommand({
      contract: parseBrowserCommandArgs(["dry-run", "navigate", "https://example.com"]).contract!,
    });
    const extract = runBrowserCommand({
      contract: parseBrowserCommandArgs(["dry-run", "extract", "product", "price"]).contract!,
    });

    expect(navigate.output).toContain("Browser dry-run");
    expect(navigate.output).toContain("- Outcome: dry-run-ready");
    expect(navigate.output).toContain("- Requested action: navigate");
    expect(navigate.output).toContain("- Recommended future runtime: Playwright CLI/Skills");
    expect(navigate.output).toContain("- Sandbox decision: future-sandbox-required");
    expect(navigate.output).toContain("- Expected evidence: navigation target");
    expect(navigate.output).toContain("- Executed: no");
    expect(navigate.output).toContain("- Browser process: not launched");
    expect(navigate.output).toContain("- MCP discovery/launch: none");
    expect(navigate.output).toContain("- Network access: none");
    expect(navigate.evidence).toContain("browser-command-runner:dry-run");

    expect(extract.output).toContain("- Outcome: dry-run-ready");
    expect(extract.output).toContain("- Requested action: extract");
    expect(extract.output).toContain("extraction schema/result summary");
    expect(extract.output).toContain("- Executed: no");
  });

  it("dry-runs click and type as future-confirmation state-changing actions without execution", () => {
    const click = runBrowserCommand({
      contract: parseBrowserCommandArgs(["dry-run", "click", "Checkout button"]).contract!,
    });
    const type = runBrowserCommand({
      contract: parseBrowserCommandArgs(["dry-run", "type", "search", "winter jacket"]).contract!,
    });

    expect(click.output).toContain("- Requested action: click");
    expect(click.output).toContain("- Sandbox decision: future-confirmation-required");
    expect(click.output).toContain("State-changing browser action would require explicit future confirmation.");
    expect(click.output).toContain("- Executed: no");
    expect(type.output).toContain("- Requested action: type");
    expect(type.output).toContain("redacted input summary");
    expect(type.output).toContain("- Executed: no");
    expect(type.output).not.toContain("winter jacket");
  });

  it("blocks auth, payment, destructive, upload, download, and ambiguous dry-run requests", () => {
    for (const args of [
      ["dry-run", "auth", "sign in"],
      ["dry-run", "payment", "buy"],
      ["dry-run", "destructive", "delete account"],
      ["dry-run", "upload", "file"],
      ["dry-run", "download", "report"],
      ["dry-run", "click"],
    ]) {
      const result = runBrowserCommand({
        contract: parseBrowserCommandArgs(args).contract!,
      });
      expect(result.output).toContain("- Outcome: blocked");
      expect(result.output).toContain("- Executed: no");
      expect(result.output).toContain("- Browser process: not launched");
      expect(result.output).toContain("- Provider/model call: none");
    }
  });

  it("classifies screenshot as future sandbox required but still non-executing", () => {
    const result = runBrowserCommand({
      contract: parseBrowserCommandArgs(["dry-run", "screenshot", "page"]).contract!,
    });

    expect(result.output).toContain("- Requested action: screenshot");
    expect(result.output).toContain("- Sandbox decision: future-sandbox-required");
    expect(result.output).toContain("screenshot summary only if a future browser policy enables screenshot handling");
    expect(result.output).toContain("- Executed: no");
  });

  it("still produces a useful dry-run plan when no backend is available", () => {
    const action = parseBrowserPreviewActionArgs(["extract", "headline"]).contract!;
    const dryRun = runBrowserDryRunHarness({
      contract: action,
      backendAvailable: false,
      now: () => "2026-05-18T00:00:00.000Z",
      nextId: () => "browser-dry-run:test",
    });

    expect(dryRun.plan.dryRunId).toBe("browser-dry-run:test");
    expect(dryRun.plan.createdAt).toBe("2026-05-18T00:00:00.000Z");
    expect(dryRun.plan.recommendedRuntime.candidate).toBe("unavailable");
    expect(dryRun.plan.blockedReasons).toContain("No browser execution backend is available.");
    expect(dryRun.plan.executed).toBe(false);
    expect(dryRun.evidence).toContain("browser-dry-run-harness:no-browser-launch");
  });

  it("keeps sandbox policy explicit for network and blocked sensitive requirements", () => {
    const navigate = parseBrowserPreviewActionArgs(["navigate", "https://example.com"]).contract!;
    const auth = parseBrowserPreviewActionArgs(["auth", "login"]).contract!;

    expect(classifyBrowserSandboxPolicy(navigate).requirements).toEqual(
      expect.arrayContaining(["network-access", "external-site", "third-party-data"]),
    );
    expect(classifyBrowserSandboxPolicy(navigate).decision).toBe("future-sandbox-required");
    expect(classifyBrowserSandboxPolicy(auth).decision).toBe("blocked");
    expect(classifyBrowserSandboxPolicy(auth).blockers.map((item) => item.requirement)).toEqual(
      expect.arrayContaining(["authentication", "credential-entry", "persistent-session"]),
    );
  });
});
