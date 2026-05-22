import { describe, expect, it } from "vitest";

import { activateAnchoredProposal } from "./anchoredProposalActivation.js";
import { evaluateAnchoredProposal } from "./anchoredProposalEval.js";
import { buildAnchoredProposalScorecard } from "./anchoredProposalScorecard.js";

describe("buildAnchoredProposalScorecard", () => {
  it("records no-run scorecard facts without proposal mutation authority", () => {
    const activation = activateAnchoredProposal({
      requestId: "scorecard",
      dryRunMode: "none",
      taskLifecycleId: "life",
      analysisBriefId: "analysis",
      analysisQualityId: "quality",
      planQualityId: "plan",
      planQualityLevel: "ready",
      redactionStatus: "redacted-and-budgeted",
    });
    const evalResult = evaluateAnchoredProposal({ activation });
    const scorecard = buildAnchoredProposalScorecard({ activation, evalResult });

    expect(scorecard.noWriteStatus).toBe("pass");
    expect(scorecard.failureClass).toBe("anchored-proposal-not-run");
    expect(scorecard.evidence).toContain("anchored-proposal-scorecard:raw-content-excluded");
  });
});
