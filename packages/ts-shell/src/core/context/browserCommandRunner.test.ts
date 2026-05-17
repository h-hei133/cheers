import { describe, expect, it } from "vitest";
import { parseBrowserPreviewActionArgs } from "./browserActionContract.js";
import { classifyBrowserActionReadiness } from "./browserActionReadiness.js";
import { browserActionRiskForKind, createBrowserCapabilityState } from "./browserCapabilityModel.js";
import { browserCapabilitySidebarToolItem, renderBrowserCapabilitySurface } from "./browserCapabilitySurface.js";
import { parseBrowserCommandArgs } from "./browserCommandContract.js";
import { runBrowserCommand } from "./browserCommandRunner.js";

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
    expect(output).toContain("Playwright CLI/Skills");
    expect(output).toContain("Playwright MCP");
    expect(output).toContain("Stagehand-like split");
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
    expect(item.summary).toContain("no browser/MCP launch");
  });
});
