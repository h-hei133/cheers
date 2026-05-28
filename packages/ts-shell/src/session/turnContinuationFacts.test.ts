import { describe, expect, it } from "vitest";

import { deriveWorkflowTurnContinuationFacts } from "./turnContinuationFacts.js";

describe("turnContinuationFacts", () => {
  it("derives seed and last-task facts without terminal success projection", () => {
    const facts = deriveWorkflowTurnContinuationFacts({
      continuity: {
        lastTaskKind: "edit-file",
        lastActionResultSeed: {
          actionKind: "read-file",
          verification: { status: "skipped" },
        },
      },
      diagnosticHandoffEvidence: {
        command: "npm test",
        status: "blocked",
      },
    });

    expect(facts.hasActionResultSeed).toBe(true);
    expect(facts.seedWasReadLike).toBe(true);
    expect(facts.lastTaskWasReadLike).toBe(true);
    expect(facts.lastTaskWasMutationLike).toBe(true);
    expect(facts.seedVerificationStatus).toBe("skipped");
    expect(facts.diagnosticVerifyStatus).toBe("blocked");
    expect(facts.diagnosticHasVerifySignal).toBe(true);
  });
});
