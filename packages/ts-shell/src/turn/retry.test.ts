import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentLoop } from "../core/agent/loop.js";
import type { AgentLifecycleEvent } from "../core/agent/events.js";
import type { RetryPolicy } from "../core/agent/retry.js";
import { createStepFunction } from "./step.js";

let workspace: string;
beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), "retry-request-"));
  fs.mkdirSync(path.join(workspace, ".agents"));
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T00:00:00Z"));
});
afterEach(async () => {
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  fs.rmSync(workspace, { recursive: true, force: true });
});

function run(input: { headers: Record<string, string>; maxDelayMs?: number; cancel?: boolean; providerRetry?: Partial<RetryPolicy> }) {
  const calls: number[] = [];
  const events: AgentLifecycleEvent[] = [];
  const controller = new AbortController();
  const step = createStepFunction({ provider: { baseUrl: "https://fixture.test", model: "fixture" },
    workspaceRoot: workspace, sessionId: "fixture", systemPrompt: "be brief", tools: [], retry: input.providerRetry,
    fetchImpl: async () => {
      calls.push(Date.now());
      return calls.length === 1 || input.providerRetry
        ? new Response("rate limited", { status: 429, headers: input.headers })
        : Response.json({ choices: [{ message: { content: "recovered" }, finish_reason: "stop" }] });
    },
  });
  const pending = runAgentLoop([{ role: "user", content: "hello" }], [], {
    retry: { maxRetries: 1, baseDelayMs: 10, maxDelayMs: input.maxDelayMs ?? 10000 },
    streamStep: (messages, signal) => step(messages, signal, {}, { allowTools: false }),
  }, event => {
    events.push(event);
    if (input.cancel && event.type === "retry_scheduled") controller.abort();
  }, controller.signal);
  return { calls, events, pending, controller };
}

describe("server retry delay across the provider and turn boundary", () => {
  it.each([
    [{ "retry-after": "5" }, 5000],
    [{ "retry-after": "5", "retry-after-ms": "7000" }, 7000],
    [{ "retry-after": "Sun, 04 Oct 2026 00:00:05 GMT" }, 5000],
  ] as const)("waits for the HTTP header %j before the next request", async (headers, delay) => {
    const result = run({ headers });
    await vi.runAllTimersAsync();
    const messages = await result.pending;
    expect(result.calls).toHaveLength(2);
    expect(result.calls[1]! - result.calls[0]!).toBe(delay);
    expect(result.events.filter(event => event.type === "retry_scheduled")).toEqual([
      { type: "retry_scheduled", attempt: 1, maxAttempts: 1, delayMs: delay },
    ]);
    expect(messages.at(-1)?.content).toBe("recovered");
  });

  it("stops with the requested delay when it exceeds the turn's ceiling", async () => {
    const result = run({ headers: { "retry-after": "20" } });
    await vi.runAllTimersAsync();
    const messages = await result.pending;
    expect(result.calls).toHaveLength(1);
    expect(result.events.some(event => event.type === "retry_scheduled")).toBe(false);
    expect(messages.at(-1)?.stopReason).toBe("error");
    expect(messages.at(-1)?.errorMessage).toContain("20s");
  });

  it("treats a zero ceiling as uncapped for a server delay", async () => {
    const result = run({ headers: { "retry-after": "5" }, maxDelayMs: 0 });
    await vi.runAllTimersAsync();
    await result.pending;
    expect(result.calls[1]! - result.calls[0]!).toBe(5000);
  });

  it("keeps an uncapped server wait beyond Node's single timer range", async () => {
    const delay = 2 ** 31 + 5000;
    const result = run({ headers: { "retry-after-ms": String(delay) }, maxDelayMs: 0 });
    await vi.runAllTimersAsync();
    await result.pending;
    expect(result.calls[1]! - result.calls[0]!).toBe(delay);
  });

  it("cancels a long wait after it has scheduled the next timer chunk", async () => {
    const result = run({ headers: { "retry-after-ms": String(2 ** 31 + 5000) }, maxDelayMs: 0 });
    await vi.advanceTimersByTimeAsync(2 ** 31 - 1);
    expect(result.calls).toHaveLength(1);
    result.controller.abort();
    await result.pending;
    expect(result.calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the wait without issuing another provider request", async () => {
    const result = run({ headers: { "retry-after": "5" }, cancel: true });
    await vi.runAllTimersAsync();
    await result.pending;
    expect(result.calls).toHaveLength(1);
    expect(result.events.some(event => event.type === "retry_attempt_start")).toBe(false);
  });

  it("does not multiply retries after the provider layer exhausted its budget", async () => {
    const result = run({ headers: { "retry-after": "5" }, providerRetry: { maxRetries: 1, maxDelayMs: 10000 } });
    await vi.runAllTimersAsync();
    const messages = await result.pending;
    expect(result.calls).toHaveLength(2);
    expect(result.calls[1]! - result.calls[0]!).toBe(5000);
    expect(result.events.some(event => event.type === "retry_scheduled")).toBe(false);
    expect(messages.at(-1)?.stopReason).toBe("error");
  });
});
