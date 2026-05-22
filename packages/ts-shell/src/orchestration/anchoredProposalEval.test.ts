import { describe, expect, it } from "vitest";

import { activateAnchoredProposal } from "./anchoredProposalActivation.js";
import { evaluateAnchoredProposal } from "./anchoredProposalEval.js";

describe("evaluateAnchoredProposal", () => {
  it("scores missing dry-run as skipped provider facts while preserving no-write pass", () => {
    const activation = activateAnchoredProposal({
      requestId: "eval-missing",
      dryRunMode: "none",
      taskLifecycleId: "life",
      analysisBriefId: "analysis",
      analysisQualityId: "quality",
      planQualityId: "plan",
      planQualityLevel: "ready",
      redactionStatus: "redacted-and-budgeted",
    });

    const evalResult = evaluateAnchoredProposal({ activation });

    expect(evalResult.promptAudit).toBe("skip");
    expect(evalResult.outputValidity).toBe("skip");
    expect(evalResult.noWriteCompliance).toBe("pass");
    expect(evalResult.overall).toBe("warn");
    expect(evalResult.evidence).toContain("anchored-proposal-eval:mutation-authority:not-granted");
  });
});
