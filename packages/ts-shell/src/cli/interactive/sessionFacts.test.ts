import { describe, expect, it } from "vitest";
import os from "node:os";
import { activeModelName, readStatusFacts, shortenPath } from "./sessionFacts.js";
import { recordSessionUsage, resetSessionUsage, markContextUnknown, getSessionUsage, restoreSessionUsage } from "../../observability/usageTelemetry.js";
import { renderStatusItem } from '../../presentation/tui/chrome/items.js';
import { stripAnsi } from '../../presentation/tui/text/ansi.js';
import { runContextCommand } from '../../core/commands/contextCommandRuntime.js';
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { RuntimeConfig } from "../../config/runtimeConfig.js";
import { withConfiguration } from "../../test-utils/configuration.js";

function context(sessionId: string, overrides: Partial<RuntimeConfig> = {}): ShellRuntimeContext {
  return withConfiguration({
    projectRoot: "/workspace/app",
    session: { id: sessionId },
    gitContext: { branch: "main" },
    runtimeConfig: {
      provider: "openai",
      providerCredentials: { openai: { model: "opus-5" } },
      contextWindow: 200_000,
      agentMode: "build",
      ...overrides,
    },
  } as unknown as ShellRuntimeContext);
}

describe("path shortening", () => {
  it("replaces the home directory with a tilde", () => {
    expect(shortenPath(`${os.homedir()}/x`)).toBe("~/x");
  });

  it("leaves an unrelated path alone", () => {
    expect(shortenPath("/opt/thing")).toBe("/opt/thing");
  });
});

describe("model name", () => {
  it("prefers the configured model for the active provider", () => {
    expect(activeModelName(context("s1"))).toBe("opus-5");
  });

  it("falls back to the provider when no model is configured", () => {
    const bare = context("s1", { providerCredentials: {} });
    expect(activeModelName(bare)).toBe("openai");
  });
});

describe("status facts", () => {
  it("keeps the configured window visible while fresh usage remains unknown", () => {
    // Reporting 0% before any request has been accounted for is a fabricated fact.
    resetSessionUsage("fresh");
    const state = readStatusFacts(context("fresh"));
    expect(state.contextUsed).toBeUndefined();
    expect(state.contextWindow).toBe(200_000);
    expect(state.contextWindowSource).toBe('config');
    expect(stripAnsi(renderStatusItem('context', state)!)).toBe('?/200k config');
    expect(state.costUsd).toBeUndefined();
    expect(state.sessionTokens).toBeUndefined();
  });

  it('retains totals across context reset and resume without reviving the old prompt size', async () => {
    const id = 'status-reset'; resetSessionUsage(id);
    const runtime = context(id, { contextWindow: undefined });
    recordSessionUsage(id, { promptTokens: 9000, completionTokens: 100 });
    const totals = structuredClone(getSessionUsage(id)); markContextUnknown(id);
    for (const resumed of [false, true]) {
      if (resumed) { resetSessionUsage(id); restoreSessionUsage(id, totals); }
      const facts = readStatusFacts(runtime);
      expect(facts.contextUsed).toBeUndefined(); expect(facts.contextWindowSource).toBe('default');
      expect(facts.contextWarning).toContain('assuming 64000'); expect(facts.sessionTokens).toBe(9100);
      expect(stripAnsi(renderStatusItem('context', facts)!)).toBe('?/64k assumed');
      expect(stripAnsi(renderStatusItem('cost', facts)!)).toContain('est $');
      expect(facts.costRates).toBe('assumed');
      const report = await runContextCommand([], { cwd: runtime.projectRoot, sessionId: id, runtimeConfig: runtime.runtimeConfig,
        readConfiguration: () => runtime.configuration.current, getToolPool: async () => new Map() });
      expect(report.output).toContain('Current prompt usage is unknown');
      expect(report.output).toContain('(assumed default)'); expect(report.output).toContain('Warning:');
      expect(report.output).not.toContain('No request has been sent');
    }
    recordSessionUsage(id, { promptTokens: 0, completionTokens: 1 });
    expect(readStatusFacts(runtime).contextUsed).toBe(0);
    expect(stripAnsi(renderStatusItem('context', readStatusFacts(runtime))!)).toBe('0/64k assumed 0%');
    resetSessionUsage(id);
  });

  it("uses the latest request's prompt size as the live footprint", () => {
    resetSessionUsage("used");
    recordSessionUsage("used", { promptTokens: 5_000, completionTokens: 100 });
    recordSessionUsage("used", { promptTokens: 9_000, completionTokens: 100 });
    const state = readStatusFacts(context("used"));
    expect(state.contextUsed).toBe(9_000);
    expect(state.contextWindow).toBe(200_000);
    expect(state.costUsd).toBeGreaterThan(0);
    resetSessionUsage("used");
  });

  it("carries branch and directory", () => {
    const state = readStatusFacts(context("s2"));
    expect(state.branch).toBe("main");
    expect(state.directory).toBe("/workspace/app");
    expect(state.provider).toBe("openai");
    expect(state.sessionId).toBe("s2");
  });

  it("carries the agent mode through for the band to decide on", () => {
    // Whether a mode is worth a segment is a presentation decision, so the facts
    // report it either way.
    expect(readStatusFacts(context("s3")).agentMode).toBe("build");
    const planning = context("s4", { agentMode: "plan" });
    expect(readStatusFacts(planning).agentMode).toBe("plan");
  });
});
