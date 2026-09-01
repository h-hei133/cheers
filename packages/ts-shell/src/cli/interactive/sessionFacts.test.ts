import { describe, expect, it } from "vitest";
import os from "node:os";
import { activeModelName, readBandState, shortenPath } from "./sessionFacts.js";
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

describe("band state", () => {
  it("omits the context gauge until real usage is recorded", () => {
    // Reporting 0% before any request has been accounted for is a fabricated fact.
    resetSessionUsage("fresh");
    const state = readBandState(context("fresh"));
    expect(state.usedTokens).toBeUndefined();
    expect(state.contextWindow).toBeUndefined();
    expect(state.costUsd).toBeUndefined();
  });

  it("uses the latest request's prompt size as the live footprint", () => {
    resetSessionUsage("used");
    recordSessionUsage("used", { promptTokens: 5_000, completionTokens: 100 });
    recordSessionUsage("used", { promptTokens: 9_000, completionTokens: 100 });
    const state = readBandState(context("used"));
    expect(state.usedTokens).toBe(9_000);
    expect(state.contextWindow).toBe(200_000);
    expect(state.costUsd).toBeGreaterThan(0);
    resetSessionUsage("used");
  });

  it("carries branch and directory", () => {
    const state = readBandState(context("s2"));
    expect(state.branch).toBe("main");
    expect(state.directory).toBe("/workspace/app");
  });

  it("shows the agent mode only when it is not the default", () => {
    expect(readBandState(context("s3")).mode).toBeUndefined();
    const planning = context("s4");
    (planning.runtimeConfig as { agentMode: string }).agentMode = "plan";
    expect(readBandState(planning).mode).toBe("plan");
  });
});
