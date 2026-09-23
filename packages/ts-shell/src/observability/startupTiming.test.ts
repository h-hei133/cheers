import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Timing has to be free when nobody asked for it, because the alternative is a
 * timer on every startup path that nobody can afford to leave in. The gate is
 * read once at import, so each case loads the module fresh with the environment
 * it needs.
 */
async function loadWith(env: string | undefined) {
  vi.resetModules();
  if (env === undefined) delete process.env.CHEERS_TIMING;
  else process.env.CHEERS_TIMING = env;
  return import("./startupTiming.js");
}

afterEach(() => {
  delete process.env.CHEERS_TIMING;
  vi.resetModules();
});

describe("startup timing", () => {
  it("records nothing when the gate is closed", async () => {
    const timing = await loadWith(undefined);
    timing.time("phase one");
    timing.time("phase two");
    expect(timing.formatTimingReport()).toContain("No timing recorded");
  });

  it("records nothing for a value other than 1", async () => {
    // "true" is a plausible way to spell it and is not the gate. Accepting it
    // would mean the documented spelling is one of several.
    const timing = await loadWith("true");
    timing.time("phase one");
    expect(timing.formatTimingReport()).toContain("No timing recorded");
  });

  it("records the phases when the gate is open", async () => {
    const timing = await loadWith("1");
    timing.time("first");
    timing.time("second");
    const report = timing.formatTimingReport();
    expect(report).toContain("first:");
    expect(report).toContain("second:");
    expect(report).toContain("total:");
  });

  it("reports the gap since the previous mark, not since the start", async () => {
    // The question is which phase was slow. A running total makes the reader do
    // that subtraction, and get it wrong once the list is long. The clock is
    // driven rather than waited on, so the assertion is exact.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      const timing = await loadWith("1");
      timing.time("first");
      vi.setSystemTime(1_000_040);
      timing.time("second");
      vi.setSystemTime(1_000_050);
      timing.time("third");

      const lines = timing.formatTimingReport().split("\n");
      expect(lines[1]).toContain("first: 0ms");
      expect(lines[2]).toContain("second: 40ms");
      // The gap, not the 50ms since the start.
      expect(lines[3]).toContain("third: 10ms");
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts a namespace on its first mark", async () => {
    // Forgetting to reset first must not lose the first measurement.
    const timing = await loadWith("1");
    timing.time("only phase");
    expect(timing.formatTimingReport()).toContain("only phase:");
  });

  it("keeps namespaces apart", async () => {
    const timing = await loadWith("1");
    timing.time("in startup");
    timing.time("in other", "other");
    expect(timing.formatTimingReport()).toContain("in startup");
    expect(timing.formatTimingReport()).not.toContain("in other");
    expect(timing.formatTimingReport("other")).toContain("in other");
  });
});
