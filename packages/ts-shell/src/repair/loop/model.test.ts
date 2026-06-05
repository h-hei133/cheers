import { describe, expect, it } from "vitest";

import { decideRepair, executeRepair } from "./model.js";

describe("repair loop model", () => {
  it("diagnoses failed verification as repair eligible without claiming success", () => {
    const decision = decideRepair({
      taskKind: "debug-repair",
      verificationState: "selected-failed",
      failureCategories: ["verification failed"],
      hostStatus: "failed",
    });

    expect(decision).toMatchObject({
      failureClass: "verification",
      state: "eligible",
      repairEligible: true,
      originalFailurePreserved: true,
      retryAllowed: true,
      nextAction: "repair",
      terminalSuccessClaim: false,
    });
  });

  it("keeps failed, unverified, blocked, and post-validation repair states distinct", () => {
    expect(decideRepair({
      taskKind: "debug-repair",
      verificationState: "selected-failed",
      failureCategories: ["repair failed"],
      hostStatus: "failed",
    }).state).toBe("failed");

    expect(decideRepair({
      taskKind: "debug-repair",
      verificationState: "insufficient",
      failureCategories: ["verification failed"],
      hostStatus: "partial",
    }).state).toBe("succeeded-unverified");

    expect(decideRepair({
      taskKind: "workspace-understanding",
      verificationState: "selected-blocked",
      failureCategories: ["missing user input"],
      hostStatus: "blocked",
    }).state).toBe("user-input-required");

    expect(decideRepair({
      taskKind: "data-artifact",
      verificationState: "selected-failed",
      artifactValidationState: "validation-failed",
      failureCategories: ["artifact invalid"],
      hostStatus: "failed",
    }).state).toBe("post-validation-failed");
  });

  it("does not pass a bounded repair action until post-validation evidence exists", () => {
    const decision = decideRepair({
      taskKind: "debug-repair",
      verificationState: "selected-failed",
      failureCategories: ["repair failed"],
      hostStatus: "failed",
    });

    expect(executeRepair({
      decision,
      actions: ["repair", "verify"],
      changedTargetCount: 1,
    })).toMatchObject({
      attempted: true,
      postValidation: "partial",
      blockers: ["post-repair validation evidence missing"],
      originalFailurePreserved: true,
      terminalSuccessClaim: false,
    });

    expect(executeRepair({
      decision,
      actions: ["repair", "verify"],
      changedTargetCount: 2,
    }).postValidation).toBe("partial");
  });

  it("rejects a repeated failed repair and selects new discovery for missing context", () => {
    const decision = decideRepair({
      taskKind: "debug-repair",
      verificationState: "selected-failed",
      failureCategories: ["repair failed", "missing context"],
      hostStatus: "failed",
      repairSignature: "parser-owner-fix",
      failureHistory: [{
        action: "repair",
        signature: "parser-owner-fix",
        reason: "same repair did not find owner context",
      }],
    });

    expect(decision).toMatchObject({
      state: "retry-exhausted",
      repairEligible: false,
      retryAllowed: false,
      nextAction: "search",
      terminalSuccessClaim: false,
    });
    expect(decision.blockers).toContain("retry exhausted");
  });

  it("uses explicit validation evidence for multi-target repair without making repair success terminal", () => {
    const decision = decideRepair({
      taskKind: "debug-repair",
      verificationState: "selected-failed",
      failureCategories: ["repair failed"],
      hostStatus: "failed",
    });

    expect(executeRepair({
      decision,
      actions: ["repair", "verify"],
      changedTargetCount: 2,
      validationEvidence: {
        status: "passed",
        check: "post-repair rollback check",
        originalFailurePreserved: true,
      },
    })).toMatchObject({
      attempted: true,
      postValidation: "passed",
      blockers: [],
      originalFailurePreserved: true,
      terminalSuccessClaim: false,
    });

    expect(executeRepair({
      decision,
      actions: ["repair", "verify"],
      changedTargetCount: 2,
      validationEvidence: {
        status: "partial",
        check: "post-repair rollback check",
        originalFailurePreserved: true,
      },
    })).toMatchObject({
      attempted: true,
      postValidation: "partial",
      blockers: ["post-repair validation partial: post-repair rollback check"],
      terminalSuccessClaim: false,
    });
  });
});
