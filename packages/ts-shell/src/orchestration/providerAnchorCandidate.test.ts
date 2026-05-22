import { describe, expect, it } from "vitest";
import { buildProviderAnchorCandidate } from "./providerAnchorCandidate.js";

describe("providerAnchorCandidate", () => {
  it("records exact bounded anchors without granting mutation authority", () => {
    const candidate = buildProviderAnchorCandidate({
      requestId: "candidate",
      index: 0,
      sourceOutputValidationId: "validation-1",
      sourceOutputStatus: "valid-exact-single-target",
      targetFileLabel: "src/app.ts",
      targetEvidenceIds: ["context-packet:id:ctx"],
      proposedOperationKind: "exact-fenced-replacement",
      oldText: "runApp",
      newText: "startApp",
    });

    expect(candidate.exactness).toBe("exact");
    expect(candidate.oldAnchorStatus).toBe("exact");
    expect(candidate.newContentStatus).toBe("bounded");
    expect(candidate.mapping?.source).toBe("old-new-fenced-blocks");
    expect(candidate.mutationAuthority).toBe("not-granted");
    expect(candidate.evidence).toContain("provider-anchor-candidate:raw-content-excluded");
  });

  it("marks fuzzy and broad outputs unsupported", () => {
    for (const status of ["fuzzy-output", "broad-refactor-output"] as const) {
      const candidate = buildProviderAnchorCandidate({
        requestId: status,
        index: 0,
        sourceOutputValidationId: `validation-${status}`,
        sourceOutputStatus: status,
        targetFileLabel: "src/app.ts",
        proposedOperationKind: status === "fuzzy-output" ? "fuzzy-replacement" : "broad-refactor",
      });

      expect(candidate.exactness).toBe("unsupported");
      expect(candidate.unsupportedReason).toContain("unsupported");
      expect(candidate.mutationAuthority).toBe("not-granted");
    }
  });
});
