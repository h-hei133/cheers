import { describe, expect, it } from "vitest";

import {
  observeVerificationResult,
  projectVerificationIntent,
} from "../../verification/result/boundary.js";
import {
  createRepairApplyRequest,
  observeRepairApply,
  observeRepairAuthority,
  observeRepairProposal,
  projectRepairRequiredHandoff,
} from "./boundary.js";

describe("repair loop boundary", () => {
  function proposalForApply() {
    const verification = observeVerificationResult({
      intent: projectVerificationIntent({
        sourceTurnId: "turn-authority",
        targetSummary: "verify target",
        dispatchStatus: "failed",
        relevanceStatus: "task_relevant",
        coverageStatus: "covered",
        authorityRequirement: "granted",
      }),
      status: "failed",
      failureClass: "test-failed",
      repairEligible: true,
      runtimeReceiptIds: ["receipt-apply-source"],
    });
    const handoff = projectRepairRequiredHandoff({ verification });
    return observeRepairProposal({
      handoff,
      proposalSource: "existing_repair_owner_projection",
      targetSummary: "src/app.ts",
      readinessStatus: "exact_ready",
      applyStatus: "not_applied",
      postRepairVerificationStatus: "not_run",
    });
  }

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
    const proposal = proposalForApply();
    const authority = observeRepairAuthority({
      proposal,
      authorityDecision: "granted",
      authoritySource: "explicit_repair_authority",
    });
    const request = createRepairApplyRequest({
      proposal,
      authority,
      expectedEditOperationKind: "hunk_set",
    });
    const apply = observeRepairApply({
      proposal,
      authority,
      request,
      repairApplyStatus: "applied",
      editApplyObservation: {
        status: "hunk-set-applied",
        changedFiles: ["src/app.ts"],
        evidence: ["edit-owner-receipt:receipt-apply-1"],
      },
      postRepairVerificationStatus: "not_run",
    });

    expect(authority.authorityDecision).toBe("granted");
    expect(request.applyReadiness).toBe("ready");
    expect(request.applyBlocker).toBe("none");
    expect(request.terminalSuccessClaim).toBe(false);
    expect(apply.repairApplyStatus).toBe("applied");
    expect(apply.repairAuthorityStatus).toBe("granted");
    expect(apply.applyAttempted).toBe(true);
    expect(apply.applyReceiptIds).toEqual(["edit-owner-receipt:receipt-apply-1"]);
    expect(apply.touchedTargetSummaries).toEqual(["src/app.ts"]);
    expect(apply.originalFailureClass).toBe("test-failed");
    expect(apply.sourceVerificationId).toBe(proposal.sourceVerificationId);
    expect(apply.postRepairVerificationStatus).toBe("not_run");
    expect(apply.terminalSuccessClaim).toBe(false);
    expect(apply.notProvenClaims).toContain(
      "repair-apply-without-post-repair-verification-is-not-success",
    );
  });

  it("keeps authority states and apply requests distinct from apply", () => {
    const proposal = proposalForApply();
    const missing = observeRepairAuthority({ proposal });
    const promptOnly = observeRepairAuthority({
      proposal,
      authorityDecision: "granted",
      authoritySource: "prompt_text_only",
    });
    const denied = observeRepairAuthority({
      proposal,
      authorityDecision: "denied",
      authoritySource: "explicit_repair_authority",
    });
    const request = createRepairApplyRequest({
      proposal,
      authority: missing,
      expectedEditOperationKind: "single_target",
    });
    const apply = observeRepairApply({
      proposal,
      authority: missing,
      request,
    });

    expect(missing.authorityDecision).toBe("missing");
    expect(promptOnly.authorityDecision).toBe("blocked");
    expect(promptOnly.authorityMissingReason).toContain("prompt text");
    expect(denied.authorityDecision).toBe("denied");
    expect(request.applyReadiness).toBe("blocked");
    expect(request.applyBlocker).toBe("authority-missing");
    expect(request.terminalSuccessClaim).toBe(false);
    expect(apply.repairApplyStatus).toBe("not_applied");
    expect(apply.applyAttempted).toBe(false);
    expect(apply.repairAuthorityStatus).toBe("required");
    expect(apply.notProvenClaims).toEqual(
      expect.arrayContaining([
        "authority-requested-is-not-granted",
        "apply-request-is-not-apply-attempted",
        "authority-granted-is-not-apply",
      ]),
    );
  });

  it("classifies controlled edit-owner apply observations without proving repair success", () => {
    const proposal = proposalForApply();
    const authority = observeRepairAuthority({
      proposal,
      authorityDecision: "granted",
      authoritySource: "edit_owner",
    });
    const request = createRepairApplyRequest({ proposal, authority });
    const blocked = observeRepairApply({
      proposal,
      authority,
      request,
      editApplyObservation: {
        status: "unconfirmed-no-write",
        changedFiles: [],
        evidence: ["edit-owner:no-write"],
      },
    });
    const failed = observeRepairApply({
      proposal,
      authority,
      request,
      editApplyObservation: {
        status: "hunk-set-failed",
        changedFiles: [],
        evidence: ["edit-owner-receipt:receipt-failed"],
      },
    });

    expect(blocked.repairApplyStatus).toBe("blocked");
    expect(blocked.applyAttempted).toBe(false);
    expect(failed.repairApplyStatus).toBe("failed");
    expect(failed.applyAttempted).toBe(true);
    expect(failed.terminalSuccessClaim).toBe(false);
    expect(failed.notProvenClaims).toContain("apply-attempted-is-not-success");
  });
});
