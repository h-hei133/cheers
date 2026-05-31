import { describe, expect, it } from "vitest";
import {
  journalFailureSurfaceBoundaryFacts,
  routeScopedEditJournalRecoveryBlockers,
  routeScopedEditJournalBoundaryFacts,
} from "./boundary.js";

describe("journal metadata boundary facts", () => {
  it("keeps route-scoped journal facts metadata-only", () => {
    expect(routeScopedEditJournalBoundaryFacts).toEqual({
      rollbackAtomicityClaim: false,
      writeCapability: "metadata-only",
      evidence: [
        "route-scoped-edit-journal:metadata-only",
        "route-scoped-edit-journal:no-runtime-writer",
        "route-scoped-edit-journal:no-rollback-atomicity-claim",
      ],
    });
  });

  it("keeps failure surface facts non-recovery and non-rollback", () => {
    expect(journalFailureSurfaceBoundaryFacts).toEqual({
      rollbackAtomicityClaim: false,
      recoveryExecuted: false,
      writeCapability: "metadata-only",
      evidence: [
        "route-scoped-edit-journal-result:failure-surface-only",
        "route-scoped-edit-journal-result:recovery-not-executed",
      ],
    });
  });

  it("keeps recovery blockers explicit and metadata-only", () => {
    expect(routeScopedEditJournalRecoveryBlockers).toEqual([
      "metadata-only-journal",
      "no-durable-snapshot",
      "no-original-content",
      "no-recovery-executor",
      "no-atomicity-authority",
      "no-persistence-authority",
    ]);
  });
});
