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
import { captureUsageAttribution } from '../../observability/usage/identity.js';
import type { ProviderCredentialResolution } from '../../core/auth/credential.js';

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
  it('keeps estimates marked and stale numbers absent from the status band', () => {
    const runtime = context('status-local-preview');
    const estimated = readStatusFacts(runtime, { promptContext: { tokens: 1700, source: 'estimated' } });
    expect(stripAnsi(renderStatusItem('context', estimated) ?? '')).toContain('~1.7k');
    const stale = readStatusFacts(runtime, { promptContext: { source: 'stale' } });
    expect(stale.contextUsed).toBeUndefined(); expect(stripAnsi(renderStatusItem('context', stale) ?? '')).toContain('? stale');
  });
  it('shows only the captured known subtotal when another destination has no prices, including after resume', () => {
    const id = 'status-captured-cost';
    try {
      const runtime = context(id);
      const capture = (baseUrl: string, rates?: { promptPerMTok: number; completionPerMTok: number }) =>
        captureUsageAttribution({ provider: 'openai', model: 'opus-5', baseUrl, rates });
      recordSessionUsage(id, { attribution: capture('https://priced.invalid', { promptPerMTok: 1, completionPerMTok: 2 }), promptTokens: 1_000_000 });
      recordSessionUsage(id, { attribution: capture('https://unknown.invalid'), promptTokens: 1_000_000 });
      const snapshot = structuredClone(getSessionUsage(id));
      for (const resumed of [false, true]) {
        if (resumed) { resetSessionUsage(id); restoreSessionUsage(id, snapshot); }
        const facts = readStatusFacts(runtime);
        expect(facts).toMatchObject({ costUsd: 1, costRates: 'catalog', costPartial: true, sessionTokens: 2_000_000 });
        expect(stripAnsi(renderStatusItem('cost', facts)!)).toBe('est $1.0000 partial');
      }
      recordSessionUsage(id, { model: 'legacy', promptTokens: 1_000_000 });
      const mixed = readStatusFacts(runtime);
      expect(mixed).toMatchObject({ costRates: 'assumed', costPartial: true });
      expect(mixed.costUsd).toBeCloseTo(1.14);
      expect(stripAnsi(renderStatusItem('cost', mixed)!)).toBe('est $1.1400 partial assumed rates');
    } finally { resetSessionUsage(id); }
  });

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

  it("drops a measurement from a different endpoint identity", async () => {
    const id = "status-stale-endpoint";
    resetSessionUsage(id);
    const runtime = context(id);
    recordSessionUsage(id, { provider: "openai", model: "opus-5", promptTokens: 9_000, promptMessageCount: 1,
      promptIdentity: { provider: "openai", model: "opus-5", endpoint: "openai-responses" } });
    expect(readStatusFacts(runtime).contextUsed).toBeUndefined();
    const report = await runContextCommand([], { cwd: runtime.projectRoot, sessionId: id,
      runtimeConfig: runtime.runtimeConfig, readConfiguration: () => runtime.configuration.current,
      getToolPool: async () => new Map() });
    expect(report.report?.facts.prompt).toMatchObject({ status: "stale" });
    resetSessionUsage(id);
  });

  it("drops a status measurement when the current endpoint cannot be resolved", () => {
    const id = "status-unresolved-endpoint";
    resetSessionUsage(id);
    const runtime = context(id);
    const resolution: ProviderCredentialResolution = {
      provider: "github-copilot",
      model: "opus-5",
      baseUrl: "https://selected.invalid",
      expectedEnvVarName: "GITHUB_COPILOT_TOKEN",
      credential: {
        provider: "github-copilot",
        source: "config",
        authMode: "account-auth",
        envVarName: "GITHUB_COPILOT_TOKEN",
        accountAuth: {
          type: "subscription",
          provider: "github-copilot",
          accessToken: "synthetic-access",
          refreshToken: "synthetic-refresh",
          expiresAt: Date.now() + 60_000,
          baseUrl: "https://api.individual.githubcopilot.com",
        },
      },
    };
    (runtime as unknown as { resolveConfigTarget: () => ProviderCredentialResolution }).resolveConfigTarget = () => resolution;
    recordSessionUsage(id, { provider: "github-copilot", model: "opus-5", promptTokens: 9_000, promptMessageCount: 1,
      promptIdentity: { provider: "github-copilot", model: "opus-5", endpoint: "copilot-chat-completions" } });
    expect(readStatusFacts(runtime).contextUsed).toBeUndefined();
    resetSessionUsage(id);
  });

  it("drops a context report measurement from a different effective schema", async () => {
    const id = "status-stale-schema";
    resetSessionUsage(id);
    const runtime = context(id);
    recordSessionUsage(id, { provider: "openai", model: "opus-5", promptTokens: 9_000, promptMessageCount: 1,
      promptIdentity: { provider: "openai", model: "opus-5", endpoint: "openai-compatible",
        schemaDigest: "f".repeat(64), systemDigest: "e".repeat(64) } });
    const report = await runContextCommand([], { cwd: runtime.projectRoot, sessionId: id,
      runtimeConfig: runtime.runtimeConfig, readConfiguration: () => runtime.configuration.current,
      getToolPool: async () => new Map(), promptIdentity: { schemaDigest: "a".repeat(64), systemDigest: "e".repeat(64) } });
    expect(report.report?.facts.prompt).toMatchObject({ status: "stale" });
    resetSessionUsage(id);
  });

  it("keeps the status measurement only when the live request identity matches", () => {
    const id = "status-live-identity";
    resetSessionUsage(id);
    const runtime = context(id);
    const identity = { provider: "openai", model: "opus-5", endpoint: "openai-compatible",
      schemaDigest: "a".repeat(64), systemDigest: "b".repeat(64) };
    recordSessionUsage(id, { promptTokens: 9_000, promptMessageCount: 1, promptIdentity: identity,
      attribution: captureUsageAttribution({ provider: 'openai', model: 'opus-5', baseUrl: 'https://api.openai.com/v1' }) });
    runtime.promptIdentity = { schemaDigest: "c".repeat(64), systemDigest: identity.systemDigest };
    expect(readStatusFacts(runtime).contextUsed).toBeUndefined();
    runtime.promptIdentity = { schemaDigest: identity.schemaDigest, systemDigest: identity.systemDigest };
    expect(readStatusFacts(runtime).contextUsed).toBe(9_000);
    resetSessionUsage(id);
  });

  it("reports a retained dynamic request identity across a nested working directory", async () => {
    const id = "status-current-system";
    resetSessionUsage(id);
    const runtime = context(id);
    recordSessionUsage(id, { provider: "openai", model: "opus-5", promptTokens: 9_000, promptMessageCount: 1,
      promptIdentity: { provider: "openai", model: "opus-5", endpoint: "openai-compatible",
        schemaDigest: "dynamic-request-schema", systemDigest: "request-system-prompt" } });
    const report = await runContextCommand([], { cwd: `${runtime.projectRoot}/nested`, projectRoot: runtime.projectRoot, sessionId: id,
      runtimeConfig: runtime.runtimeConfig, readConfiguration: () => runtime.configuration.current,
      getToolPool: async () => new Map(), promptIdentity: { schemaDigest: "dynamic-request-schema", systemDigest: "request-system-prompt" } });
    expect(report.report?.facts.prompt).toMatchObject({ status: "measured", tokens: 9_000 });
    resetSessionUsage(id);
  });

  it("does not validate a stored identity after the live request identity is cleared", async () => {
    const id = "status-cleared-live-identity";
    resetSessionUsage(id);
    const runtime = context(id);
    recordSessionUsage(id, { provider: "openai", model: "opus-5", promptTokens: 9_000, promptMessageCount: 1,
      promptIdentity: { provider: "openai", model: "opus-5", endpoint: "openai-compatible",
        schemaDigest: "a".repeat(64), systemDigest: "b".repeat(64) } });
    runtime.promptIdentity = undefined;
    const report = await runContextCommand([], { cwd: runtime.projectRoot, sessionId: id,
      runtimeConfig: runtime.runtimeConfig, readConfiguration: () => runtime.configuration.current,
      getToolPool: async () => new Map() });
    expect(report.report?.facts.prompt).toMatchObject({ status: "stale" });
    resetSessionUsage(id);
  });

  it("drops a context report measurement without a current system identity", async () => {
    const id = "status-stale-system";
    resetSessionUsage(id);
    const runtime = context(id);
    recordSessionUsage(id, { provider: "openai", model: "opus-5", promptTokens: 9_000, promptMessageCount: 1,
      promptIdentity: { provider: "openai", model: "opus-5", endpoint: "openai-compatible",
        schemaDigest: "a".repeat(64), systemDigest: "e".repeat(64) } });
    const report = await runContextCommand([], { cwd: runtime.projectRoot, sessionId: id,
      runtimeConfig: runtime.runtimeConfig, readConfiguration: () => runtime.configuration.current,
      getToolPool: async () => new Map(), promptIdentity: { schemaDigest: "a".repeat(64) } });
    expect(report.report?.facts.prompt).toMatchObject({ status: "stale" });
    resetSessionUsage(id);
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
