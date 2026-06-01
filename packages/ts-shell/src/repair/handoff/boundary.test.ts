import { describe, expect, it } from "vitest";

import {
  observeVerificationResult,
  projectVerificationIntent,
} from "../../verification/result/boundary.js";
import {
  observeRepairApply,
  observeRepairProposal,
  projectRepairRequiredHandoff,
} from "./boundary.js";

describe("repair loop boundary", () => {
  it("creates repair-required handoff while preserving original failure", () => {
    const verification = observeVerificationResult({
      intent: projectVerificationIntent({
        sourceTurnId: "turn-repair",
        targetSummary: "verify target",
        dispatchStatus: "failed",
        relevanceStatus: "task_relevant",
        coverageStatus: "covered",
        authorityRequirement: "granted",
      }),
      status: "failed",
      failureClass: "test-failed",
      repairEligible: true,
      runtimeReceiptIds: ["receipt-original-failure"],
    });
    const handoff = projectRepairRequiredHandoff({ verification });

    expect(handoff.repairabilityStatus).toBe("repair_required");
    expect(handoff.sourceVerificationId).toBe(verification.verificationId);
    expect(handoff.failureClass).toBe("test-failed");
    expect(handoff.originalFailureSummary).toContain("failed");
    expect(handoff.taskRelevanceStatus).toBe("task_relevant");
    expect(handoff.coverageStatus).toBe("covered");
    expect(handoff.authorityState).toBe("granted");
    expect(handoff.runtimeReceiptIds).toEqual(["receipt-original-failure"]);
    expect(handoff.repairEligible).toBe(true);
    expect(handoff.repairBlocker).toBe("none");
    expect(handoff.repairRisk).toBe("low");
    expect(handoff.originalFailurePreserved).toBe(true);
    expect(handoff.terminalSuccessClaim).toBe(false);
    expect(handoff.notProvenClaims).toContain("repair-required-is-not-success");
  });

  it("keeps repair-required states distinct for blocked and unsupported failures", () => {
    const missingAuthority = projectRepairRequiredHandoff({
      verification: observeVerificationResult({
        intent: projectVerificationIntent({
          sourceTurnId: "turn-missing-authority",
          targetSummary: "verify target",
          dispatchStatus: "failed",
          relevanceStatus: "task_relevant",
          coverageStatus: "covered",
          authorityRequirement: "required",
        }),
        status: "failed",
        failureClass: "test-failed",
        repairEligible: true,
      }),
    });
    const unsupported = projectRepairRequiredHandoff({
      verification: observeVerificationResult({
        intent: projectVerificationIntent({
          sourceTurnId: "turn-unsupported",
          targetSummary: "verify target",
          dispatchStatus: "failed",
          relevanceStatus: "task_relevant",
          coverageStatus: "covered",
          authorityRequirement: "granted",
        }),
        status: "failed",
        failureClass: "environment-failed",
        repairEligible: false,
      }),
    });
    const unsafe = projectRepairRequiredHandoff({
      verification: observeVerificationResult({
        intent: projectVerificationIntent({
          sourceTurnId: "turn-unsafe",
          targetSummary: "verify target",
          dispatchStatus: "failed",
          relevanceStatus: "task_relevant",
          coverageStatus: "covered",
          authorityRequirement: "granted",
        }),
        status: "failed",
        failureClass: "command-blocked-by-policy",
        repairEligible: false,
      }),
    });
    const notProven = projectRepairRequiredHandoff({
      verification: observeVerificationResult({
        intent: projectVerificationIntent({
          sourceTurnId: "turn-not-proven",
          targetSummary: "verify target",
          dispatchStatus: "planned",
          relevanceStatus: "not_proven",
          coverageStatus: "not_proven",
        }),
        status: "not_run",
      }),
    });

    expect(missingAuthority.repairabilityStatus).toBe("repair_possible");
    expect(missingAuthority.repairBlocker).toBe("missing-authority");
    expect(unsupported.repairabilityStatus).toBe("unsupported");
    expect(unsupported.repairBlocker).toBe("unsupported-failure-class");
    expect(unsafe.repairabilityStatus).toBe("repair_not_available");
    expect(unsafe.repairBlocker).toBe("unsafe-failure-class");
    expect(notProven.repairabilityStatus).toBe("not_proven");
    expect(notProven.repairBlocker).toBe("verification-not-failed");
    expect(missingAuthority.terminalSuccessClaim).toBe(false);
    expect(unsupported.terminalSuccessClaim).toBe(false);
    expect(unsafe.terminalSuccessClaim).toBe(false);
    expect(notProven.terminalSuccessClaim).toBe(false);
  });

  it("keeps proposal-only and continuation-only observations out of success", () => {
    const verification = observeVerificationResult({
      intent: projectVerificationIntent({
        sourceTurnId: "turn-proposal",
        targetSummary: "verify target",
        dispatchStatus: "failed",
        relevanceStatus: "task_relevant",
        coverageStatus: "covered",
        authorityRequirement: "granted",
      }),
      status: "failed",
      failureClass: "test-failed",
      repairEligible: true,
      runtimeReceiptIds: ["receipt-proposal-source"],
    });
    const handoff = projectRepairRequiredHandoff({ verification });
    const proposal = observeRepairProposal({
      handoff,
      proposalSource: "existing_repair_owner_projection",
      targetSummary: "repair continuation proposed",
      readinessStatus: "partial",
      applyStatus: "not_applied",
      postRepairVerificationStatus: "not_run",
    });

    expect(proposal.applyStatus).toBe("not_applied");
    expect(proposal.postRepairVerificationStatus).toBe("not_run");
    expect(proposal.sourceVerificationId).toBe(verification.verificationId);
    expect(proposal.originalFailureClass).toBe("test-failed");
    expect(proposal.originalFailureSummary).toBe(handoff.originalFailureSummary);
    expect(proposal.taskRelevanceStatus).toBe("task_relevant");
    expect(proposal.coverageStatus).toBe("covered");
    expect(proposal.runtimeReceiptIds).toEqual(["receipt-proposal-source"]);
    expect(proposal.proposalRisk).toBe("low");
    expect(proposal.terminalSuccessClaim).toBe(false);
    expect(proposal.notProvenClaims).toEqual(
      expect.arrayContaining([
        "repair-proposal-is-not-success",
        "repair-continuation-is-not-success",
        "repair-proposal-is-not-apply",
        "post-repair-verification-not-run-is-not-success",
      ]),
    );
  });

  it("keeps applied repair without post-repair verification as not success", () => {
    const verification = observeVerificationResult({
      intent: projectVerificationIntent({
        sourceTurnId: "turn-apply",
        targetSummary: "verify target",
        dispatchStatus: "failed",
        relevanceStatus: "task_relevant",
      }),
      status: "failed",
    });
    const handoff = projectRepairRequiredHandoff({ verification });
    const proposal = observeRepairProposal({ handoff, applyStatus: "not_applied" });
    const apply = observeRepairApply({
      proposal,
      repairApplyStatus: "applied",
      repairAuthorityStatus: "granted",
      postRepairVerificationStatus: "not_run",
    });

    expect(apply.repairApplyStatus).toBe("applied");
    expect(apply.postRepairVerificationStatus).toBe("not_run");
    expect(apply.terminalSuccessClaim).toBe(false);
    expect(apply.notProvenClaims).toContain(
      "repair-apply-without-post-repair-verification-is-not-success",
    );
  });
});
