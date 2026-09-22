import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMMAND_TIMEOUT_MS,
  MAX_COMMAND_TIMEOUT_MS,
  resolveCommandTimeout,
} from "./commandTimeout.js";

/**
 * The bound a command runs under. Two properties matter and are easy to lose:
 * a command with no stated timeout still gets one, and a timeout past the
 * platform's ceiling is refused rather than silently replaced.
 */
describe("resolveCommandTimeout", () => {
  it("applies the default when the caller names none", () => {
    expect(resolveCommandTimeout(undefined)).toEqual({
      ok: true,
      timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
    });
    expect(resolveCommandTimeout(null)).toEqual({
      ok: true,
      timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
    });
  });

  it("converts seconds to milliseconds", () => {
    expect(resolveCommandTimeout(120)).toEqual({ ok: true, timeoutMs: 120_000 });
    expect(resolveCommandTimeout(0.5)).toEqual({ ok: true, timeoutMs: 500 });
  });

  it("refuses a value past the platform ceiling instead of clamping it", () => {
    // `setTimeout` stores its delay in a signed 32-bit integer, so a larger value
    // overflows and fires immediately. Clamping would run something other than
    // what was asked for; refusing is the only answer that keeps the promise.
    const result = resolveCommandTimeout(MAX_COMMAND_TIMEOUT_MS / 1000 + 1);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toContain("maximum is");
    }
  });

  it("accepts the ceiling exactly", () => {
    expect(resolveCommandTimeout(MAX_COMMAND_TIMEOUT_MS / 1000)).toEqual({
      ok: true,
      timeoutMs: MAX_COMMAND_TIMEOUT_MS,
    });
  });

  it("refuses zero, negatives and non-numbers", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "60", {}]) {
      const result = resolveCommandTimeout(bad);
      expect(result.ok, `expected ${JSON.stringify(bad)} to be refused`).toBe(false);
    }
  });
});
