import { describe, expect, it } from "vitest";

import { buildRepairVerdictProofInput } from "../../evidence/projection/repair/verdict.js";
import { projectRepairVerdictTerminal } from "../../result/projection/repair/verdict.js";
import {
  observePostRepairVerificationResult,
  observeVerificationResult,
  projectVerificationIntent,
  requestPostRepairVerification,
  requirePostRepairVerification,
} from "../../verification/result/boundary.js";
import {
  createRepairApplyRequest,
  observeRepairApply,
  observeRepairAuthority,
  observeRepairProposal,
  projectRepairRequiredHandoff,
} from "./boundary.js";
import { projectRepairReadiness } from "./readiness.js";

describe("repair handoff readiness", () => {
  it("connects failed verification to a complete repair verdict chain without owning terminal truth", () => {
    const chain = completeChain();
    const readiness = projectRepairReadiness(chain);

    expect(readiness).toMatchObject({
      status: "verdict_projected",
      sourceVerificationId: chain.verification.verificationId,
      repairRequiredFact: "repairRequired=repair_required; blocker=none",
      explicitAuthorityFact:
        "authority=granted; source=explicit_repair_authority",
      applyAttemptFact: "applyAttempted=true; status=applied",
      postRepairVerificationFact: "postRepair=passed; receipts=1",
      verdictFact: "resultStatus=verified_with_repair; missingProof=none",
      nextAction:
        "use result-owned verdict; do not infer success from readiness",
      missingProofItems: [],
      terminalSuccessClaim: false,
    });
    expect(readiness.repairProposalFact).toContain("readiness=exact_ready");
    expect(readiness.notProvenClaims).toEqual(
      expect.arrayContaining([
        "repair-readiness-is-not-terminal-truth",
        "repair-proposal-is-not-success",
        "repair-apply-without-post-repair-verification-is-not-success",
        "missing-proof-remains-not-proven",
      ]),
    );
  });

  it("exposes the next action from the first missing chain step", () => {
    const chain = completeChain();

    expect(projectRepairReadiness({ verification: chain.verification }))
      .toMatchObject({
        status: "repair_required",
        nextAction: "project repair-required handoff from failed verification",
        missingProofItems: expect.arrayContaining(["repair-required"]),
        terminalSuccessClaim: false,
      });
    expect(projectRepairReadiness({
      verification: chain.verification,
      repairRequired: chain.repairRequired,
      repairProposal: chain.repairProposal,
    })).toMatchObject({
      status: "awaiting_authority",
      nextAction: "obtain explicit repair authority before apply",
      missingProofItems: expect.arrayContaining(["explicit-authority"]),
      terminalSuccessClaim: false,
    });
    expect(projectRepairReadiness({
      verification: chain.verification,
      repairRequired: chain.repairRequired,
      repairProposal: chain.repairProposal,
      repairAuthority: chain.repairAuthority,
      repairApplyRequest: chain.repairApplyRequest,
      repairApply: chain.repairApply,
    })).toMatchObject({
      status: "awaiting_post_repair_verification",
      nextAction: "run post-repair verification before verdict",
      missingProofItems: expect.arrayContaining([
        "post-repair-verification",
        "complete-evidence-proof",
        "result-owned-verdict",
      ]),
      terminalSuccessClaim: false,
    });
  });

  it("does not infer success from proposal, authority, apply, render, packet, or carry-forward facts", () => {
    const chain = completeChain();
    const proposalOnly = projectRepairReadiness({
      verification: chain.verification,
      repairRequired: chain.repairRequired,
      repairProposal: chain.repairProposal,
    });
    const authorityOnly = projectRepairReadiness({
      verification: chain.verification,
      repairRequired: chain.repairRequired,
      repairProposal: chain.repairProposal,
      repairAuthority: chain.repairAuthority,
    });
    const applyOnly = projectRepairReadiness({
      verification: chain.verification,
      repairRequired: chain.repairRequired,
      repairProposal: chain.repairProposal,
      repairAuthority: chain.repairAuthority,
      repairApplyRequest: chain.repairApplyRequest,
      repairApply: chain.repairApply,
    });
    const surfacePacketCarryForwardOnly = projectRepairReadiness({
      notProvenClaims: [
        "rendered-output-is-not-success",
        "product-completion-packet-is-not-terminal-truth",
        "session-carry-forward-is-not-terminal-truth",
      ],
    });

    expect(proposalOnly.status).toBe("awaiting_authority");
    expect(authorityOnly.status).toBe("ready_to_apply");
    expect(applyOnly.status).toBe("awaiting_post_repair_verification");
    expect(surfacePacketCarryForwardOnly.status).toBe("not_proven");
    for (const readiness of [
      proposalOnly,
      authorityOnly,
      applyOnly,
      surfacePacketCarryForwardOnly,
    ]) {
      expect(readiness.terminalSuccessClaim).toBe(false);
      expect(readiness.missingProofItems.length).toBeGreaterThan(0);
      expect(readiness.notProvenClaims).toEqual(
        expect.arrayContaining([
          "repair-readiness-is-not-terminal-truth",
          "repair-chain-incomplete",
        ]),
      );
    }
  });
});

function completeChain() {
  const intent = projectVerificationIntent({
    sourceTurnId: "turn-repair-readiness",
    targetSummary: "verify repaired target",
    dispatchStatus: "failed",
    relevanceStatus: "task_relevant",
    coverageStatus: "covered",
    authorityRequirement: "granted",
  });
  const verification = observeVerificationResult({
    intent,
    status: "failed",
    failureClass: "test-failed",
    repairEligible: true,
    runtimeReceiptIds: ["receipt-original"],
  });
  const repairRequired = projectRepairRequiredHandoff({ verification });
  const repairProposal = observeRepairProposal({
    handoff: repairRequired,
    proposalSource: "existing_repair_owner_projection",
    targetSummary: "src/app.ts",
    readinessStatus: "exact_ready",
    applyStatus: "not_applied",
    postRepairVerificationStatus: "not_run",
  });
  const repairAuthority = observeRepairAuthority({
    proposal: repairProposal,
    authorityDecision: "granted",
    authoritySource: "explicit_repair_authority",
  });
  const repairApplyRequest = createRepairApplyRequest({
    proposal: repairProposal,
    authority: repairAuthority,
    expectedEditOperationKind: "hunk_set",
  });
  const repairApply = observeRepairApply({
    proposal: repairProposal,
    authority: repairAuthority,
    request: repairApplyRequest,
    editApplyObservation: {
      status: "hunk-set-applied",
      changedFiles: ["src/app.ts"],
      evidence: ["receipt-apply"],
    },
    applyReceiptIds: ["receipt-apply"],
    postRepairVerificationStatus: "not_run",
  });
  const postRepairVerificationRequirement = requirePostRepairVerification({
    repairApply,
  });
  const postRepairVerificationRequest = requestPostRepairVerification({
    requirement: postRepairVerificationRequirement,
    dispatchStatus: "dispatched",
    receiptIds: ["receipt-post-repair"],
  });
  const postRepairVerificationResult = observePostRepairVerificationResult({
    requirement: postRepairVerificationRequirement,
    request: postRepairVerificationRequest,
    status: "passed",
    receiptIds: ["receipt-post-repair"],
  });
  const repairVerdictProofInput = buildRepairVerdictProofInput({
    postRepairVerification: postRepairVerificationResult,
  });
  const repairVerdictTerminalProjection = projectRepairVerdictTerminal({
    proofInput: repairVerdictProofInput,
  });

  return {
    verification,
    repairRequired,
    repairProposal,
    repairAuthority,
    repairApplyRequest,
    repairApply,
    postRepairVerificationRequirement,
    postRepairVerificationRequest,
    postRepairVerificationResult,
    repairVerdictProofInput,
    repairVerdictTerminalProjection,
  };
}
