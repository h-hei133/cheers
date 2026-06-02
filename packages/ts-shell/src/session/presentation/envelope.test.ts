import { describe, expect, it } from "vitest";

import {
  PRODUCT_TRUTH_MATRIX,
  PRODUCT_TRUTH_NEGATIVE_CASES,
  productTruthCase,
} from "../../runtime/loop/truthMatrix.test.js";
import { projectSessionStatusEnvelope } from "./envelope.js";

describe("session status envelope", () => {
  it("projects complete proof as the only complete proof state", () => {
    const item = productTruthCase("complete_proof");
    const complete = projectSessionStatusEnvelope(item.productSurface);

    expect(complete).toMatchObject({
      state: "complete_proof",
      completeProof: true,
      terminalSuccessClaim: false,
      controlStatus: "stop_complete",
    });
    expect(complete.terminalVerdict).toBe(item.productSurface.verdict);
    expect(complete.terminalTruthStatus).toBe("passed");
  });

  it.each(PRODUCT_TRUTH_NEGATIVE_CASES)(
    "keeps shared non-success matrix case non-complete for $name",
    (item) => {
      const envelope = projectSessionStatusEnvelope(item.productSurface);

      expect(envelope.state).not.toBe("complete_proof");
      expect(envelope.completeProof).toBe(false);
      expect(envelope.terminalSuccessClaim).toBe(false);
      expect(envelope.controlStatus).toBe(item.expected.loopDecision);
      expect(envelope.missingProof).toEqual(item.expected.missingProofItems);
      expect(envelope.terminalVerdict).toBe(item.productSurface.verdict);
    },
  );

  it.each([
    "blocked_request_preparation",
    "failed_tool_outcome",
    "missing_proof",
    "proposal_only",
    "apply_without_post_repair_verification",
    "post_repair_failed_verification",
    "partial_stopped_loop",
    "waiting_for_user",
  ] as const)(
    "carries required status dimensions for %s",
    (name) => {
      const item = productTruthCase(name);
      const envelope = projectSessionStatusEnvelope(item.productSurface);

      expect(envelope.nextAction).toBe(item.productSurface.nextAction);
      expect(envelope.requestPreparation.status).toBeTruthy();
      expect(envelope.continuationReadiness).toBeTruthy();
      expect(envelope.replayCarryForward.status).toBeTruthy();
      expect(envelope.toolOutcome.status).toBeTruthy();
      expect(envelope.verification.status).toBeTruthy();
      expect(envelope.repair.status).toBeTruthy();
      expect(envelope.safeDetails.length).toBeGreaterThan(0);
    },
  );

  it("excludes redaction-sensitive markers from every matrix envelope", () => {
    for (const item of PRODUCT_TRUTH_MATRIX) {
      const envelope = projectSessionStatusEnvelope(item.productSurface);
      const serialized = JSON.stringify(envelope);

      expect(serialized).not.toMatch(
        /raw provider output|hidden reasoning|token=secret|oldText=before|newText=after|private-agents-real/i,
      );
    }
  });
});
