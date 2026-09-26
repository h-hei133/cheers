import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROVIDER_RETRIES,
  DEFAULT_TURN_RETRIES,
  exceedsRetryCeiling,
  isRetryableFailure,
  isRetryableStatus,
  resolveRetryPolicy,
  retryDelayMs,
  serverRequestedDelayMs,
  waitBeforeRetry,
} from "./retry.js";
import { createStepFunction } from "../../turn/step.js";
import { runAgentLoop } from "./loop.js";

/**
 * Retrying is a decision about which failures are worth a second request. What
 * matters is that a transient one is retried, a permanent one is not, and the
 * wait is the server's number when the server gave one.
 */

describe("isRetryableStatus", () => {
  it("treats a request that never arrived as retryable", () => {
    // No status means the transport failed, which is the case a second attempt
    // most often fixes.
    expect(isRetryableStatus(undefined)).toBe(true);
  });

  it("retries throttling, timeouts and server faults", () => {
    for (const status of [408, 409, 429, 500, 502, 503, 504]) {
      expect(isRetryableStatus(status)).toBe(true);
    }
  });

  it("does not retry a request the server rejected as wrong", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryableStatus(status)).toBe(false);
    }
  });
});

describe("isRetryableFailure", () => {
  it("retries a rate limit reported in words", () => {
    expect(isRetryableFailure("error", "Provider HTTP 429: rate limit exceeded")).toBe(true);
  });

  it("retries a dropped socket", () => {
    expect(isRetryableFailure("error", "Network error: socket connection was closed unexpectedly")).toBe(true);
  });

  it("never retries a cancelled run", () => {
    // The user stopped it; asking again would be answering a question nobody
    // is waiting for.
    expect(isRetryableFailure("aborted", "Network error: fetch failed")).toBe(false);
  });

  it("does not retry a failure that will still hold", () => {
    expect(isRetryableFailure("error", "Provider HTTP 429: insufficient_quota")).toBe(false);
    expect(isRetryableFailure("error", "billing hard limit reached")).toBe(false);
  });

  it("prefers the account limit over the status code that carried it", () => {
    // A 429 carrying `insufficient_quota` is both a throttle and an exhausted
    // account. Retrying spends quota to learn the same thing, so the limit wins.
    const message = "Provider HTTP 429: insufficient_quota";
    expect(message.includes("429")).toBe(true);
    expect(isRetryableFailure("error", message)).toBe(false);
  });

  it("leaves a successful step alone", () => {
    expect(isRetryableFailure("stop", undefined)).toBe(false);
  });
});

describe("serverRequestedDelayMs", () => {
  it("prefers the millisecond header", () => {
    expect(serverRequestedDelayMs("1500", "9")).toBe(1500);
  });

  it("reads seconds as seconds", () => {
    expect(serverRequestedDelayMs(null, "2")).toBe(2000);
  });

  it("reads an HTTP date as a wait from now", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    expect(serverRequestedDelayMs(null, "Thu, 01 Jan 2026 00:00:30 GMT", now)).toBe(30_000);
  });

  it("reports nothing when the header is unreadable", () => {
    // Falling back to the local backoff is right; treating a malformed header as
    // a zero wait would retry immediately.
    expect(serverRequestedDelayMs(null, "soon")).toBeUndefined();
    expect(serverRequestedDelayMs("", null)).toBeUndefined();
    expect(serverRequestedDelayMs(null, null)).toBeUndefined();
  });
});

describe("retryDelayMs", () => {
  const policy = { enabled: true, maxRetries: 3, baseDelayMs: 1_000, maxDelayMs: 60_000 };

  /** The window a locally computed delay may fall in: full value down to 75%. */
  function between(full: number): [number, number] {
    return [full * 0.75, full];
  }

  it("doubles from the base", () => {
    // Ranges rather than exact values: the delay is spread so clients that
    // failed together do not retry together, and pinning the exact number would
    // be pinning the absence of that spread.
    for (const [attempt, full] of [
      [1, 1_000],
      [2, 2_000],
      [3, 4_000],
    ] as const) {
      const [low, high] = between(full);
      const delay = retryDelayMs(policy, attempt, undefined);
      expect(delay, `attempt ${attempt}`).toBeGreaterThanOrEqual(low);
      expect(delay, `attempt ${attempt}`).toBeLessThanOrEqual(high);
    }
  });

  it("does not return the same delay every time", () => {
    // The point of the spread: two clients that failed at the same instant must
    // not wake at the same instant, or a shared outage becomes a synchronised
    // one. Without jitter this set has exactly one member.
    const delays = new Set(Array.from({ length: 20 }, () => retryDelayMs(policy, 3, undefined)));

    expect(delays.size).toBeGreaterThan(1);
  });

  it("never exceeds the delay the backoff computed", () => {
    // Downward only, so the ceiling stays a real ceiling.
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      expect(retryDelayMs(policy, attempt, undefined)).toBeLessThanOrEqual(
        Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs),
      );
    }
  });

  it("stops growing at the ceiling", () => {
    expect(retryDelayMs({ ...policy, maxDelayMs: 3_000 }, 9, undefined)).toBeLessThanOrEqual(3_000);
    expect(retryDelayMs({ ...policy, maxDelayMs: 3_000 }, 9, undefined)).toBeGreaterThan(0);
  });

  it("lets the server's number override the local backoff", () => {
    // The server is describing its own refill; a guess cannot beat that.
    expect(retryDelayMs(policy, 1, 30_000)).toBe(30_000);
  });

  it("uses the server's number exactly rather than spreading it", () => {
    // It is an instruction, not a guess: spreading it would be ignoring what the
    // host asked for. Ten calls, one value.
    const delays = new Set(Array.from({ length: 10 }, () => retryDelayMs(policy, 1, 30_000)));

    expect([...delays]).toEqual([30_000]);
  });

  it("still caps what a server may ask for", () => {
    expect(retryDelayMs({ ...policy, maxDelayMs: 5_000 }, 1, 600_000)).toBe(5_000);
  });
});

describe("resolveRetryPolicy", () => {
  it("gives each layer its own default count", () => {
    expect(resolveRetryPolicy("turn", {}).maxRetries).toBe(DEFAULT_TURN_RETRIES);
    expect(resolveRetryPolicy("provider", {}).maxRetries).toBe(DEFAULT_PROVIDER_RETRIES);
  });

  it("turns every layer off from the one switch", () => {
    const off = resolveRetryPolicy("turn", { enabled: false, maxRetries: 9 });
    expect(off.enabled).toBe(false);
    expect(off.maxRetries).toBe(0);
  });

  it("refuses a negative count rather than retrying forever", () => {
    expect(resolveRetryPolicy("turn", { maxRetries: -4 }).maxRetries).toBe(0);
  });
});

describe("waitBeforeRetry", () => {
  it("waits the delay when nothing interrupts it", async () => {
    await expect(waitBeforeRetry(5, undefined)).resolves.toBe(true);
  });

  it("gives up as soon as the run is cancelled", async () => {
    const controller = new AbortController();
    const waiting = waitBeforeRetry(5_000, controller.signal);
    controller.abort();
    await expect(waiting).resolves.toBe(false);
  });

  it("does not wait at all when the run is already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(waitBeforeRetry(5_000, controller.signal)).resolves.toBe(false);
  });
});

describe("a wait longer than the ceiling", () => {
  /**
   * A server that names a delay beyond the ceiling is saying the endpoint is not
   * worth asking again yet. Sleeping the ceiling and asking anyway spends a
   * request to be told the same thing, and the number it gave — the part a caller
   * can act on — never reaches anyone.
   */
  it("is recognised as a refusal rather than clamped into a retry", () => {
    const policy = { enabled: true, maxRetries: 3, baseDelayMs: 2_000, maxDelayMs: 60_000 };

    expect(exceedsRetryCeiling(policy, 3_600_000)).toBe(true);
    expect(exceedsRetryCeiling(policy, 5_000)).toBe(false);
    expect(exceedsRetryCeiling(policy, undefined)).toBe(false);
    // A ceiling of zero means no ceiling, so nothing exceeds it.
    expect(exceedsRetryCeiling({ ...policy, maxDelayMs: 0 }, 3_600_000)).toBe(false);
  });

  it("leaves a short server delay untouched", () => {
    const policy = { enabled: true, maxRetries: 3, baseDelayMs: 2_000, maxDelayMs: 60_000 };

    expect(retryDelayMs(policy, 1, 5_000)).toBe(5_000);
  });
});

describe("two layers retrying the same failure", () => {
  /**
   * Only one layer may act on a given failure.
   *
   * Both exist because they see different facts — the provider layer sees the
   * status and the server's own delay, the turn layer sees the finished step and
   * can retry after the context has been reshaped. But a failure both of them
   * retry is retried once per layer, which multiplies rather than chooses: with
   * two retries each, one overloaded endpoint receives nine requests.
   *
   * Counted at the transport, because that is the only place the multiplication
   * is visible — each layer believes it made the retries it was configured for.
   */
  it("sends one request per retry, not one per layer per retry", async () => {
    let calls = 0;
    const retry = { enabled: true, maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2 };
    const step = createStepFunction({
      provider: { apiKey: "k", baseUrl: "https://p.test/v1", model: "m" },
      workspaceRoot: process.cwd(),
      sessionId: "s",
      systemPrompt: "x",
      tools: [],
      retry,
      fetchImpl: async () => {
        calls += 1;
        return new Response("busy", { status: 503 });
      },
    });
    await runAgentLoop(
      [{ role: "user", content: "hi" }],
      [],
      { tools: [], streamStep: (context, signal) => step(context, signal, {}, { allowTools: true }), retry },
      () => {},
      undefined,
    );

    // One attempt plus two retries. Nine is what the two layers produce if both
    // act on the same failure.
    expect(calls).toBe(3);
  });

  it("still lets the turn layer retry when the provider layer does not", async () => {
    // The default is no provider retries, so the loop is the only layer that
    // can. A marker set unconditionally would leave a transient failure with no
    // retry at all — worse than the doubling it exists to prevent.
    let calls = 0;
    // The provider layer is configured with none, which is the default; the turn
    // layer keeps its own. They are separate settings precisely so this is
    // expressible.
    const providerRetry = { enabled: true, maxRetries: 0, baseDelayMs: 1, maxDelayMs: 2 };
    const turnRetry = { enabled: true, maxRetries: 3, baseDelayMs: 1, maxDelayMs: 2 };
    const step = createStepFunction({
      provider: { apiKey: "k", baseUrl: "https://p.test/v1", model: "m" },
      workspaceRoot: process.cwd(),
      sessionId: "s",
      systemPrompt: "x",
      tools: [],
      retry: providerRetry,
      fetchImpl: async () => {
        calls += 1;
        return new Response("busy", { status: 503 });
      },
    });
    await runAgentLoop(
      [{ role: "user", content: "hi" }],
      [],
      { tools: [], streamStep: (context, signal) => step(context, signal, {}, { allowTools: true }), retry: turnRetry },
      () => {},
      undefined,
    );

    // The turn layer's three retries apply: 1 + 3.
    expect(calls).toBe(4);
  });
});
