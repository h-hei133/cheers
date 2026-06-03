import { describe, expect, it } from "vitest";

import { decideRepair } from "./model.js";

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
});
