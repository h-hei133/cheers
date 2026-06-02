import { describe, expect, it } from "vitest";

import { projectHostEvidenceProof } from "../../evidence/host/proof.js";
import { projectHostTruth } from "./verdict.js";

describe("host truth projection", () => {
  it("keeps missing proof not-proven even when host facts exist", () => {
    const evidence = projectHostEvidenceProof({});
    const truth = projectHostTruth({ evidence });

    expect(evidence).toMatchObject({
      status: "not-proven",
      evidenceOwner: "evidence",
      terminalSuccessClaim: false,
    });
    expect(truth).toMatchObject({
      completeProof: false,
      successOwner: "evidence-result-verdict",
      terminalClassification: "stopped",
      terminalSuccessClaim: false,
    });
    expect(truth.notProvenClaims).toContain(
      "missing-complete-evidence-result-verdict",
    );
  });

  it("requires both complete evidence and result-owned success", () => {
    const evidence = projectHostEvidenceProof({
      proofInput: {
        proofInputId: "host-proof:complete",
        proofStatus: "complete",
        missingProofItems: [],
        verificationStatus: "passed",
        repairStatus: "applied",
        terminalSuccessClaim: false,
        notProvenClaims: ["repair-apply-is-not-success"],
      } as any,
    });
    const truth = projectHostTruth({
      evidence,
      result: {
        projectionId: "host-result:complete",
        status: "verified_with_repair",
        terminalClassification: "success",
        terminalSuccessClaim: false,
        notProvenClaims: ["result-projection-is-not-cli-success"],
      } as any,
    });

    expect(truth).toMatchObject({
      evidenceStatus: "complete",
      resultStatus: "verified_with_repair",
      terminalClassification: "success",
      completeProof: true,
      successOwner: "evidence-result-verdict",
      terminalSuccessClaim: false,
    });
  });

  it("does not let a result-owned success override incomplete evidence", () => {
    const evidence = projectHostEvidenceProof({
      proofInput: {
        proofInputId: "host-proof:incomplete",
        proofStatus: "incomplete",
        missingProofItems: ["whole-task-verification"],
        verificationStatus: "not-run",
        repairStatus: "not-run",
        terminalSuccessClaim: false,
        notProvenClaims: ["verification-not-run"],
      } as any,
    });
    const truth = projectHostTruth({
      evidence,
      result: {
        projectionId: "host-result:claimed",
        status: "verified_with_repair",
        terminalClassification: "success",
        terminalSuccessClaim: false,
        notProvenClaims: [],
      } as any,
    });

    expect(truth.completeProof).toBe(false);
    expect(truth.terminalClassification).toBe("stopped");
    expect(truth.terminalSuccessClaim).toBe(false);
  });
});
