import type { ContextAwareProviderPromptContext } from "./contextAwareProviderPrompt.js";
import type { ProviderEditRawProposal } from "./providerEditProposal.js";

export interface LiveProviderSmokeFixture {
  readonly fixtureId: string;
  readonly targetLabel: string;
  readonly currentContent: string;
  readonly taskIntentLabel: string;
  readonly expectedOldText: string;
  readonly expectedNewText: string;
  readonly promptContext: ContextAwareProviderPromptContext;
}

export interface LiveProviderSmokeFixtureRequest {
  readonly fixtureId: string;
  readonly requestId: string;
  readonly lifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly analysisQualityId?: string;
  readonly planQualityId?: string;
  readonly planQualityLevel?: string;
  readonly contextPacketId?: string;
  readonly contextGraphId?: string;
  readonly codeGraphTraceId?: string;
  readonly taskExecutionPlanId?: string;
}

export function buildLiveSmokeFixture(
  input: LiveProviderSmokeFixtureRequest,
): LiveProviderSmokeFixture {
  const { fixtureId, requestId } = input;
  const targetLabel = resolveFixtureTarget(fixtureId);
  const currentContent = resolveFixtureContent(fixtureId);

  return {
    fixtureId,
    targetLabel,
    currentContent,
    taskIntentLabel: "rename startApp function to runApp in the smoke target",
    expectedOldText: "export function startApp() {",
    expectedNewText: "export function runApp() {",
    promptContext: buildLiveSmokePromptContext({
      fixtureId,
      requestId,
      targetLabel,
      lifecycleId: input.lifecycleId ?? "live_smoke_life",
      analysisBriefId: input.analysisBriefId ?? "live_smoke_analysis",
      analysisQualityId: input.analysisQualityId ?? "live_smoke_analysis_quality",
      planQualityId: input.planQualityId ?? "live_smoke_plan_quality",
      planQualityLevel: input.planQualityLevel ?? "ready",
      contextPacketId: input.contextPacketId ?? "live_smoke_ctx",
      contextGraphId: input.contextGraphId ?? "live_smoke_graph",
      codeGraphTraceId: input.codeGraphTraceId ?? "live_smoke_code_trace",
      taskExecutionPlanId: input.taskExecutionPlanId ?? "live_smoke_exec",
      userRequest: "rename startApp function to runApp in the smoke target",
    }),
  };
}

export function buildLiveSmokeExpectedAnchoredProposal(
  fixture: LiveProviderSmokeFixture,
): ProviderEditRawProposal {
  return {
    operationKind: "exact-fenced-replacement",
    targets: [
      {
        path: fixture.targetLabel,
        summary: fixture.taskIntentLabel,
        oldText: fixture.expectedOldText,
        newText: fixture.expectedNewText,
      },
    ],
    verificationPlan: ["npm test -- smoke"],
  };
}

export const LIVE_SMOKE_FIXTURE_SOURCE = [
  "export function startApp() {",
  "  return { started: true };",
  "}",
  "",
  "export function startOther() {",
  "  return { started: false };",
  "}",
].join("\n");

function resolveFixtureTarget(_fixtureId: string): string {
  return "src/smoke.ts";
}

function resolveFixtureContent(_fixtureId: string): string {
  return LIVE_SMOKE_FIXTURE_SOURCE;
}

function buildLiveSmokePromptContext(input: {
  readonly fixtureId: string;
  readonly requestId: string;
  readonly targetLabel: string;
  readonly lifecycleId: string;
  readonly analysisBriefId: string;
  readonly analysisQualityId: string;
  readonly planQualityId: string;
  readonly planQualityLevel: string;
  readonly contextPacketId: string;
  readonly contextGraphId: string;
  readonly codeGraphTraceId: string;
  readonly taskExecutionPlanId: string;
  readonly userRequest: string;
}): ContextAwareProviderPromptContext {
  return {
    requestId: input.requestId,
    contextPacketId: input.contextPacketId,
    contextGraphId: input.contextGraphId,
    agentPlanId: "live_smoke_agent_plan",
    taskLifecycleId: input.lifecycleId,
    analysisBriefId: input.analysisBriefId,
    taskExecutionPlanId: input.taskExecutionPlanId,
    userRequest: input.userRequest,
    targetSummary: input.targetLabel,
    target: { pathLabel: input.targetLabel, summary: "live smoke fixture target" },
    relatedContext: [],
    constraints: ["return exact old/new anchors", "do not apply changes", "single-target only"],
    nonGoals: ["mutation", "fuzzy apply", "provider call during apply", "multi-file edit"],
    missingFacts: [],
    suggestedReads: [],
    suggestedVerification: ["npm test -- smoke"],
    omittedContentReasons: ["raw file content excluded from provider prompt"],
    codeGraphTraceId: input.codeGraphTraceId,
    verificationExpectation: "review-before-apply",
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    providerPrompt: [
      "Create a review-only provider edit proposal from explicit context.",
      `Request: rename startApp function to runApp in ${input.targetLabel}`,
      `Context packet: ${input.contextPacketId}`,
      `Code graph trace: ${input.codeGraphTraceId}`,
      `Analysis brief: ${input.analysisBriefId}`,
      `Target: ${input.targetLabel}`,
      "Current content contains: export function startApp() { ... }",
      "Return a bounded proposal only; mutation authority is not granted.",
    ].join("\n"),
    evidence: [
      "context-aware-provider-prompt:redacted-and-budgeted",
      "context-aware-provider-prompt:raw-full-content-excluded",
      "context-aware-provider-prompt:mutation-authority:not-granted",
    ],
  };
}
