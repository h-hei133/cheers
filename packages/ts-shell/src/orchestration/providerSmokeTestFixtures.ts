import type { ContextAwareProviderPromptContext } from "./contextAwareProviderPrompt.js";

export function readySmokeInput(requestId: string) {
  return {
    requestId,
    lifecycleId: "life_196",
    analysisBriefId: "analysis_196",
    analysisQualityId: "analysis_quality_196",
    analysisQualityDecision: "allow" as const,
    planQualityId: "plan_quality_196",
    planQualityLevel: "ready",
    contextPacketId: "ctx_196",
    contextGraphId: "graph_196",
    codeGraphTraceId: "code_trace_196",
    taskExecutionPlanId: "exec_196",
    redactionStatus: "redacted-and-budgeted",
  };
}

export function readyDryRunInput(requestId: string) {
  return {
    requestId,
    dryRunOptIn: true,
    promptContext: buildPrompt(requestId),
    explicitTargetLabels: ["src/app.ts"],
    lifecycleId: "life_196",
    analysisBriefId: "analysis_196",
    analysisQualityId: "analysis_quality_196",
    analysisQualityDecision: "allow",
    planQualityId: "plan_quality_196",
    planQualityLevel: "ready",
    contextPacketId: "ctx_196",
    contextGraphId: "graph_196",
    codeGraphTraceId: "code_trace_196",
    taskExecutionPlanId: "exec_196",
    providerAvailability: { kind: "available", providerKindLabel: "fake-real-provider" } as const,
    redactionStatus: "redacted-and-budgeted",
  };
}

export function buildPrompt(requestId: string): ContextAwareProviderPromptContext {
  return {
    requestId,
    contextPacketId: "ctx_196",
    contextGraphId: "graph_196",
    agentPlanId: "agent_plan_196",
    taskLifecycleId: "life_196",
    analysisBriefId: "analysis_196",
    taskExecutionPlanId: "exec_196",
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
    codeGraphTraceId: "code_trace_196",
    verificationExpectation: "review-before-apply",
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    providerPrompt:
      "Create a review-only provider edit proposal. Target: src/app.ts. Analysis brief: analysis_196. Return a bounded proposal only; mutation authority is not granted and changes must not be applied.",
    evidence: ["context-aware-provider-prompt:redacted-and-budgeted"],
  };
}
