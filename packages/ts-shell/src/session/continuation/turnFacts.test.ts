import { describe, expect, it } from "vitest";

import { deriveWorkflowTurnContinuationFacts } from "./turnFacts.js";

describe("turnContinuationFacts", () => {
  it("derives seed and last-task facts without terminal success projection", () => {
    const facts = deriveWorkflowTurnContinuationFacts({
      continuity: {
        lastTaskKind: "edit-file",
        recentChangedFiles: ["src/changed.ts"],
        recentVerifiedFiles: [],
        pendingProofGap: ["artifact evidence missing"],
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
    expect(facts.proofGap).toEqual(expect.arrayContaining([
      "artifact evidence missing",
      "changed files not verified",
      "seed verification not passed",
      "diagnostic verification not passed",
    ]));
    expect(facts.pendingAction).toBe("verify");
    expect(facts.nextAction).toBe("verify");
  });

  it("restores explicit pending action and proof gap across continuation", () => {
    const facts = deriveWorkflowTurnContinuationFacts({
      continuity: {
        lastTaskKind: "write-file",
        pendingAction: "artifact",
        pendingNextAction: "artifact",
        pendingProofGap: ["claim evidence missing"],
      },
    });

    expect(facts.pendingAction).toBe("artifact");
    expect(facts.nextAction).toBe("artifact");
    expect(facts.proofGap).toContain("claim evidence missing");
  });

  it("prefers discovery when continuation proof gap says context is missing", () => {
    const facts = deriveWorkflowTurnContinuationFacts({
      continuity: {
        lastTaskKind: "edit-file",
        recentFailedFiles: [{ path: "src/app.ts", reason: "missing context" }],
        pendingProofGap: ["context evidence incomplete"],
      },
    });

    expect(facts.pendingAction).toBe("search");
    expect(facts.nextAction).toBe("search");
    expect(facts.proofGap).toEqual(expect.arrayContaining([
      "context evidence incomplete",
      "recent failure unresolved",
    ]));
  });
});
