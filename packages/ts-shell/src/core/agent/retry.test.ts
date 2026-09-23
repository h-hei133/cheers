import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROVIDER_RETRIES,
  DEFAULT_TURN_RETRIES,
  isRetryableFailure,
  isRetryableStatus,
  resolveRetryPolicy,
  retryDelayMs,
  serverRequestedDelayMs,
  waitBeforeRetry,
} from "./retry.js";

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

  it("doubles from the base", () => {
    expect(retryDelayMs(policy, 1, undefined)).toBe(1_000);
    expect(retryDelayMs(policy, 2, undefined)).toBe(2_000);
    expect(retryDelayMs(policy, 3, undefined)).toBe(4_000);
  });

  it("stops growing at the ceiling", () => {
    expect(retryDelayMs({ ...policy, maxDelayMs: 3_000 }, 9, undefined)).toBe(3_000);
  });

  it("lets the server's number override the local backoff", () => {
    // The server is describing its own refill; a guess cannot beat that.
    expect(retryDelayMs(policy, 1, 30_000)).toBe(30_000);
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
