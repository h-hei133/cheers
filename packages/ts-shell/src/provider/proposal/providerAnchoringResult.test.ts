import { describe, expect, it } from "vitest";
import { buildProviderAnchoringResult } from "./providerAnchoringResult.js";

describe("providerAnchoringResult", () => {
  it("summarizes exact, partial, ambiguous, stale, and unsupported no-write outcomes", () => {
    expect(
      buildProviderAnchoringResult({
        candidateCount: 1,
        exactCount: 1,
        partialCount: 0,
        unsupportedCount: 0,
        matchOutcome: "exact-match",
      }).status,
    ).toBe("exact-anchors-ready-for-review");

    expect(
      buildProviderAnchoringResult({
        candidateCount: 1,
        exactCount: 0,
        partialCount: 1,
        unsupportedCount: 0,
        matchOutcome: "single-candidate-needs-review",
        suggestedReads: ["src/app.ts"],
      }).status,
    ).toBe("partial-anchors-review-only");

    expect(
      buildProviderAnchoringResult({
        candidateCount: 1,
        exactCount: 0,
        partialCount: 0,
        unsupportedCount: 1,
        matchOutcome: "multiple-candidates-ambiguous",
      }).status,
    ).toBe("ambiguous-anchors-need-target-selection");

    expect(
      buildProviderAnchoringResult({
        candidateCount: 1,
        exactCount: 0,
        partialCount: 0,
        unsupportedCount: 1,
        matchOutcome: "stale-context",
      }).status,
    ).toBe("stale-context-blocks-anchoring");

    const unsupported = buildProviderAnchoringResult({
      candidateCount: 1,
      exactCount: 0,
      partialCount: 0,
      unsupportedCount: 1,
      matchOutcome: "unsupported",
    });
    expect(unsupported.status).toBe("unsupported-fuzzy-or-broad-output");
    expect(unsupported.mutationAuthority).toBe("not-granted");
    expect(unsupported.safeSummary).toContain("raw-content-excluded");
  });
});
