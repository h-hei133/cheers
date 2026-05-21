import { describe, expect, it } from "vitest";
import {
  classifyTargetSetExecutionFailure,
  evaluateTargetSetEditPreflightPolicy,
} from "./targetSetEditPolicy.js";
import type { TargetSetEditPlan } from "./targetSetEditPlan.js";

describe("targetSetEditPolicy", () => {
  it("allows mutation only after all-target preflight passes", () => {
    const policy = evaluateTargetSetEditPreflightPolicy({
      status: "ready",
      manifestId: "manifest-test",
      maxFiles: 3,
      targetCount: 2,
      targets: [],
      redactionStatus: "raw-content-excluded",
      evidence: ["target-set-edit-plan:all-targets-preflighted"],
    });

    expect(policy.status).toBe("passed");
    expect(policy.mutationAllowed).toBe(true);
    expect(policy.writeAtomicityClaim).toBe(false);
    expect(policy.evidence).toEqual(
      expect.arrayContaining([
        "target-set-edit-policy:all-target-preflight-before-first-mutation",
        "target-set-edit-policy:no-write-atomicity-claim",
      ]),
    );
  });

  it("stops blocked plans as no-write policy", () => {
    const policy = evaluateTargetSetEditPreflightPolicy(blockedPlan());

    expect(policy.status).toBe("stopped");
    expect(policy.mutationAllowed).toBe(false);
    expect(policy.maxFileGuard).toBe("over-limit");
    expect(policy.evidence).toContain("target-set-edit-policy:mutation:not-run");
  });

  it("classifies execution failure after mutation as partial failure", () => {
    expect(
      classifyTargetSetExecutionFailure({
        changedFileCount: 1,
        failedFileCount: 1,
      }),
    ).toBe("partial-failure");
    expect(
      classifyTargetSetExecutionFailure({
        changedFileCount: 0,
        failedFileCount: 1,
      }),
    ).toBe("failed-before-change");
  });
});

function blockedPlan(): TargetSetEditPlan {
  return {
    status: "blocked",
    manifestId: "manifest-test",
    maxFiles: 3,
    targetCount: 4,
    blocker: "over-max-files",
    reason: "Too many files.",
    nextAction: "Confirm at most three files.",
    redactionStatus: "raw-content-excluded",
    evidence: ["target-set-edit-plan:blocker:over-max-files"],
  };
}
