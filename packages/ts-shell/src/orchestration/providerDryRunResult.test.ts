import { describe, expect, it } from "vitest";
import { buildProviderDryRunResult } from "./providerDryRunResult.js";
import { runRealProviderProposalDryRun } from "./realProviderProposalDryRun.js";
import type { ContextAwareProviderPromptContext } from "./contextAwareProviderPrompt.js";

describe("providerDryRunResult", () => {
  it("projects provider dry-run status through no-write result surface", async () => {
    const dryRun = await runRealProviderProposalDryRun({
      requestId: "req-result",
      dryRunOptIn: true,
      promptContext: buildPrompt(),
      explicitTargetLabels: ["src/app.ts"],
      lifecycleId: "life_193",
      analysisBriefId: "analysis_193",
      analysisQualityId: "analysis_quality_193",
      analysisQualityDecision: "allow",
      planQualityId: "plan_quality_193",
      planQualityLevel: "ready",
      contextPacketId: "ctx_193",
      contextGraphId: "graph_193",
      codeGraphTraceId: "code_trace_193",
      taskExecutionPlanId: "exec_193",
      providerAvailability: { kind: "available", providerKindLabel: "fake-real-provider" },
      redactionStatus: "redacted-and-budgeted",
      provider: {
        proposeEdit: () => ({
          operationKind: "exact-fenced-replacement",
          targets: [{ path: "src/app.ts", oldText: "runApp", newText: "startApp" }],
        }),
      },
      currentContentByTargetLabel: new Map([["src/app.ts", "runApp\n"]]),
    });
    const result = buildProviderDryRunResult({
      sessionId: "session-193",
      prompt: "dry-run proposal",
      dryRun,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        `real-provider-proposal-dry-run-result:status:${dryRun.status}`,
        `provider-anchored-proposal:id:${dryRun.anchoredProposal.anchoredProposalId}`,
        "provider-anchoring-result:status:anchored-proposal-handoff-ready",
        "real-provider-proposal-dry-run-result:mutation-authority:not-granted",
      ]),
    );
    expect(result.codingResult?.continuation.evidence.join("\n")).toContain(
      "real-provider-proposal-dry-run id=",
    );
  });
});

function buildPrompt(): ContextAwareProviderPromptContext {
  return {
    requestId: "req-result",
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
    constraints: [],
    nonGoals: ["do not apply"],
    missingFacts: [],
    suggestedReads: [],
    suggestedVerification: ["npm test -- app"],
    omittedContentReasons: [],
    verificationExpectation: "review-before-apply",
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    providerPrompt:
      "Create a review-only provider edit proposal. Target: src/app.ts. Analysis brief: analysis_193. mutation authority is not granted and changes must not be applied.",
    evidence: ["context-aware-provider-prompt:redacted-and-budgeted"],
  };
}
