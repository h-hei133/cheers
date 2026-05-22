import { describe, expect, it } from "vitest";
import type { ContextAwareProviderPromptContext } from "./contextAwareProviderPrompt.js";
import { auditProviderPrompt } from "./providerPromptAudit.js";

describe("providerPromptAudit", () => {
  it("passes redacted bounded prompt context with safety and verification expectations", () => {
    const audit = auditProviderPrompt({
      requestId: "req-193",
      promptContext: buildPrompt(),
    });

    expect(audit.status).toBe("pass");
    expect(audit.contextBudgetStatus).toBe("within-budget");
    expect(audit.targetCoverage).toBe("present");
    expect(audit.analysisEvidenceCoverage).toBe("present");
    expect(audit.secretRedaction).toBe("confirmed");
    expect(audit.providerConfigExclusion).toBe("confirmed");
    expect(audit.safetyConstraintsPresence).toBe("present");
    expect(audit.evidence).toContain("provider-prompt-audit:mutation-authority:not-granted");
  });

  it("fails private config secret and raw hidden content risks without printing raw values", () => {
    const audit = auditProviderPrompt({
      requestId: "req-risk",
      promptContext: {
        ...buildPrompt(),
        providerPrompt:
          "Request: inspect /home/wang/.private-agents-real Authorization: Bearer abcdefgh12345 hidden reasoning raw unbounded file",
      },
    });

    expect(audit.status).toBe("fail");
    expect(audit.blockedReasons).toEqual(
      expect.arrayContaining([
        "secret-or-private-config-risk",
        "hidden-or-raw-content-risk",
      ]),
    );
    expect(audit.summary).not.toContain("abcdefgh12345");
  });
});

function buildPrompt(): ContextAwareProviderPromptContext {
  return {
    requestId: "req-193",
    contextPacketId: "ctx_193",
    contextGraphId: "graph_193",
    agentPlanId: "plan_193",
    taskLifecycleId: "life_193",
    analysisBriefId: "analysis_193",
    taskExecutionPlanId: "exec_193",
    userRequest: "rename runApp",
    targetSummary: "src/app.ts",
    target: { pathLabel: "src/app.ts", summary: "exports runApp" },
    relatedContext: [],
    constraints: ["keep no-write"],
    nonGoals: ["do not apply"],
    missingFacts: [],
    suggestedReads: [],
    suggestedVerification: ["npm test -- app"],
    omittedContentReasons: [],
    verificationExpectation: "review-before-apply",
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    providerPrompt:
      "Create a review-only provider edit proposal. Target: src/app.ts. Analysis brief: analysis_193. Return a bounded proposal only; mutation authority is not granted and changes must not be applied.",
    evidence: ["context-aware-provider-prompt:redacted-and-budgeted"],
  };
}
