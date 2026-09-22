import { describe, expect, it } from "vitest";
import os from "node:os";
import { activeModelName, readStatusFacts, shortenPath } from "./sessionFacts.js";
import { recordSessionUsage, resetSessionUsage } from "../../observability/usageTelemetry.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";

function context(sessionId: string): ShellRuntimeContext {
  return {
    projectRoot: "/workspace/app",
    session: { id: sessionId },
    gitContext: { branch: "main" },
    runtimeConfig: {
      provider: "openai",
      providerCredentials: { openai: { model: "opus-5" } },
      contextWindow: 200_000,
      agentMode: "build",
    },
  } as unknown as ShellRuntimeContext;
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
    const bare = context("s1");
    (bare.runtimeConfig as { providerCredentials: unknown }).providerCredentials = {};
    expect(activeModelName(bare)).toBe("openai");
  });
});

describe("status facts", () => {
  it("omits the context gauge until real usage is recorded", () => {
    // Reporting 0% before any request has been accounted for is a fabricated fact.
    resetSessionUsage("fresh");
    const state = readStatusFacts(context("fresh"));
    expect(state.contextUsed).toBeUndefined();
    expect(state.contextWindow).toBeUndefined();
    expect(state.costUsd).toBeUndefined();
    expect(state.sessionTokens).toBeUndefined();
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
    const planning = context("s4");
    (planning.runtimeConfig as { agentMode: string }).agentMode = "plan";
    expect(readStatusFacts(planning).agentMode).toBe("plan");
  });
});
