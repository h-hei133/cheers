import { describe, expect, it } from "vitest";

import { PROPOSAL_QUALITY_CORPUS, getProposalQualityCorpusCase } from "./proposalQualityCorpus.js";

describe("proposalQualityCorpus", () => {
  it("covers deterministic anchored proposal quality classes", () => {
    expect(PROPOSAL_QUALITY_CORPUS.map((entry) => entry.caseId)).toEqual([
      "exact-single-target",
      "exact-multi-hunk",
      "partial-anchor",
      "unanchored-generated",
      "fuzzy-output",
      "broad-refactor",
      "malformed-output",
      "unsafe-output",
      "stale-context",
      "ambiguous-target",
      "conflicting-hunks",
    ]);
    expect(PROPOSAL_QUALITY_CORPUS.every((entry) => entry.expectedNoWriteStatus === "pass")).toBe(true);
    expect(getProposalQualityCorpusCase("unsafe-output").expectedAnchorQuality).toBe("unsafe");
  });
});
