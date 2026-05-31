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
      }),
      status: "failed",
      failureClass: "test-failure",
    });
    const handoff = projectRepairRequiredHandoff({ verification });

    expect(handoff.repairabilityStatus).toBe("repair_required");
    expect(handoff.originalFailurePreserved).toBe(true);
    expect(handoff.terminalSuccessClaim).toBe(false);
    expect(handoff.notProvenClaims).toContain("repair-required-is-not-success");
  });

  it("keeps proposal-only and continuation-only observations out of success", () => {
    const verification = observeVerificationResult({
      intent: projectVerificationIntent({
        sourceTurnId: "turn-proposal",
        targetSummary: "verify target",
        dispatchStatus: "failed",
        relevanceStatus: "task_relevant",
      }),
      status: "failed",
    });
    const handoff = projectRepairRequiredHandoff({ verification });
    const proposal = observeRepairProposal({
      handoff,
      proposalSource: "existing_repair_owner_projection",
      targetSummary: "repair continuation proposed",
      readinessStatus: "partial",
      applyStatus: "not_applied",
    });

    expect(proposal.applyStatus).toBe("not_applied");
    expect(proposal.terminalSuccessClaim).toBe(false);
    expect(proposal.notProvenClaims).toEqual(
      expect.arrayContaining([
        "repair-proposal-is-not-success",
        "repair-continuation-is-not-success",
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
