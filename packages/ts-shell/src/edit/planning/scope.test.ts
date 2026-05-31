import { describe, expect, it } from "vitest";

import {
  buildLocalMutationScopeBlockedPlan,
  resolveMutationScopePlanning,
} from "./scope.js";

describe("mutationScopePlanning", () => {
  it("projects local mutation scope from read fragment evidence", () => {
    const scope = resolveMutationScopePlanning({
      prompt: "Edit this part",
      readFragment: {
        lineIndexes: [2, 3],
        ranges: ["2-3"],
        sourceWindowStart: 0,
        sourceWindowEnd: 10,
        fingerprint: "fp",
      },
      hasEditIntent: true,
      hasExecutionCorrectionCue: false,
      hasContinuationCue: false,
      hasGroundedReadLikeIntent: false,
      hasVerifyIntent: false,
      hasDiagnosisIntent: false,
      hasCreateIntent: false,
    });

    expect(scope.hasLocalMutationCue).toBe(true);
    expect(scope.hasMutationScopeEvidence).toBe(true);
    expect(scope.fields).toEqual({
      mutationScopeLineIndexes: [2, 3],
      mutationScopeRanges: ["2-3"],
      mutationScopeSourceWindowStart: 0,
      mutationScopeSourceWindowEnd: 10,
      mutationScopeFingerprint: "fp",
    });
    expect(scope.requiredFields).toEqual({ mutationScopeRequired: true });
  });

  it("keeps missing local scope blocked without implying write success", () => {
    const plan = buildLocalMutationScopeBlockedPlan({
      usedRestoredState: true,
    });

    expect(plan).toMatchObject({
      taskKind: "edit-file",
      reason: "local mutation follow-up lacks explain fragment scope evidence",
      targetMissing: false,
      verifyAfterEdit: false,
      usedRestoredState: true,
    });
    expect(plan.blockedReason).toContain("no reliable local fragment");
  });
});
