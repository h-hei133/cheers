import { describe, expect, it } from "vitest";
import {
  journalFailureSurfaceBoundaryFacts,
  routeScopedEditJournalBoundaryFacts,
} from "./journalMetadataBoundary.js";

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
});
