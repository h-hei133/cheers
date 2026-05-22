import { describe, expect, it } from "vitest";
import { matchProviderAnchorCandidates } from "./providerAnchorMatcher.js";
import { extractProviderProposalAnchors } from "./providerProposalAnchors.js";
import { validateProviderOutput } from "./providerOutputValidator.js";

describe("providerAnchorMatcher", () => {
  it("matches exact candidate against current safe read content", () => {
    const candidates = exactCandidates("match", "runApp", "startApp");
    const result = matchProviderAnchorCandidates({
      requestId: "match",
      candidates,
      explicitTargetLabels: ["src/app.ts"],
      currentContentByTargetLabel: new Map([["src/app.ts", "runApp\n"]]),
    });

    expect(result.outcome).toBe("exact-match");
    expect(result.exactMatchIds).toEqual([candidates[0]?.candidateId]);
    expect(result.matches[0]?.range).toEqual({ startLine: 0, endLine: 1 });
    expect(result.evidence).toContain("provider-anchor-match:exact:1");
  });

  it("keeps missing safe read, ambiguous match, stale context, and no-match no-write", () => {
    const candidates = exactCandidates("review", "runApp", "startApp");

    expect(
      matchProviderAnchorCandidates({
        requestId: "review",
        candidates,
        explicitTargetLabels: ["src/app.ts"],
      }).outcome,
    ).toBe("single-candidate-needs-review");

    expect(
      matchProviderAnchorCandidates({
        requestId: "ambiguous",
        candidates,
        explicitTargetLabels: ["src/app.ts"],
        currentContentByTargetLabel: new Map([["src/app.ts", "runApp\nrunApp\n"]]),
      }).outcome,
    ).toBe("multiple-candidates-ambiguous");

    expect(
      matchProviderAnchorCandidates({
        requestId: "stale",
        candidates,
        explicitTargetLabels: ["src/app.ts"],
        staleTargetLabels: ["src/app.ts"],
        currentContentByTargetLabel: new Map([["src/app.ts", "runApp\n"]]),
      }).outcome,
    ).toBe("stale-context");

    expect(
      matchProviderAnchorCandidates({
        requestId: "none",
        candidates,
        explicitTargetLabels: ["src/app.ts"],
        currentContentByTargetLabel: new Map([["src/app.ts", "startApp\n"]]),
      }).outcome,
    ).toBe("no-match");
  });
});

function exactCandidates(requestId: string, oldText: string, newText: string) {
  const rawOutput = {
    operationKind: "exact-fenced-replacement" as const,
    targets: [{ path: "src/app.ts", oldText, newText }],
  };
  return extractProviderProposalAnchors({
    requestId,
    rawOutput,
    validation: validateProviderOutput({
      requestId,
      rawOutput,
      explicitTargetLabels: ["src/app.ts"],
    }),
  }).candidates;
}
