import type { LiveProviderSmokeFixture } from "./liveProviderSmokeFixture.js";

export interface LiveProviderSmokeEvidenceInput {
  readonly fixture: LiveProviderSmokeFixture;
  readonly lifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly analysisQualityId?: string;
  readonly analysisQualityDecision?: "allow" | "stop" | string;
  readonly planQualityId?: string;
  readonly planQualityLevel?: string;
  readonly contextPacketId?: string;
  readonly contextGraphId?: string;
  readonly codeGraphTraceId?: string;
  readonly taskExecutionPlanId?: string;
  readonly redactionStatus?: string;
}

export interface LiveProviderSmokeEvidence {
  readonly lifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly analysisQualityId?: string;
  readonly analysisQualityDecision?: "allow" | "stop" | string;
  readonly planQualityId?: string;
  readonly planQualityLevel?: string;
  readonly contextPacketId?: string;
  readonly contextGraphId?: string;
  readonly codeGraphTraceId?: string;
  readonly taskExecutionPlanId?: string;
  readonly redactionStatus?: string;
  readonly mutationAuthority: "not-granted";
  readonly noWriteStatus: "pass";
  readonly missing: readonly string[];
  readonly evidence: readonly string[];
}

export function normalizeLiveProviderSmokeEvidence(
  input: LiveProviderSmokeEvidenceInput,
): LiveProviderSmokeEvidence {
  const promptContext = input.fixture.promptContext;
  const lifecycleId = input.lifecycleId ?? promptContext.taskLifecycleId;
  const analysisBriefId = input.analysisBriefId ?? promptContext.analysisBriefId;
  const analysisQualityId = input.analysisQualityId ?? promptContext.analysisQualityId;
  const analysisQualityDecision =
    input.analysisQualityDecision ?? promptContext.analysisQualityDecision ?? "allow";
  const planQualityId = input.planQualityId ?? promptContext.planQualityId;
  const planQualityLevel = input.planQualityLevel ?? promptContext.planQualityLevel ?? "ready";
  const contextPacketId = input.contextPacketId ?? promptContext.contextPacketId;
  const contextGraphId = input.contextGraphId ?? promptContext.contextGraphId;
  const codeGraphTraceId = input.codeGraphTraceId ?? promptContext.codeGraphTraceId;
  const taskExecutionPlanId = input.taskExecutionPlanId ?? promptContext.taskExecutionPlanId;
  const redactionStatus = input.redactionStatus ?? promptContext.redactionStatus;

  const missing = [
    ...(lifecycleId ? [] : ["lifecycle-id"]),
    ...(analysisBriefId ? [] : ["analysis-brief-id"]),
    ...(analysisQualityId ? [] : ["analysis-quality-id"]),
    ...(planQualityId ? [] : ["plan-quality-id"]),
    ...(contextPacketId ? [] : ["context-packet-id"]),
    ...(contextGraphId ? [] : ["context-graph-id"]),
    ...(codeGraphTraceId ? [] : ["code-graph-trace-id"]),
    ...(redactionStatus ? [] : ["redaction-status"]),
  ];

  return {
    ...(lifecycleId ? { lifecycleId } : {}),
    ...(analysisBriefId ? { analysisBriefId } : {}),
    ...(analysisQualityId ? { analysisQualityId } : {}),
    ...(analysisQualityDecision ? { analysisQualityDecision } : {}),
    ...(planQualityId ? { planQualityId } : {}),
    ...(planQualityLevel ? { planQualityLevel } : {}),
    ...(contextPacketId ? { contextPacketId } : {}),
    ...(contextGraphId ? { contextGraphId } : {}),
    ...(codeGraphTraceId ? { codeGraphTraceId } : {}),
    ...(taskExecutionPlanId ? { taskExecutionPlanId } : {}),
    ...(redactionStatus ? { redactionStatus } : {}),
    mutationAuthority: "not-granted",
    noWriteStatus: "pass",
    missing,
    evidence: [
      "live-smoke-evidence:normalized",
      ...(lifecycleId ? [`live-smoke-evidence:lifecycle:${lifecycleId}`] : []),
      ...(analysisBriefId ? [`live-smoke-evidence:analysis-brief:${analysisBriefId}`] : []),
      ...(analysisQualityId ? [`live-smoke-evidence:analysis-quality:${analysisQualityId}`] : []),
      ...(planQualityId ? [`live-smoke-evidence:plan-quality:${planQualityId}`] : []),
      ...(contextPacketId ? [`live-smoke-evidence:context-packet:${contextPacketId}`] : []),
      ...(contextGraphId ? [`live-smoke-evidence:context-graph:${contextGraphId}`] : []),
      ...(codeGraphTraceId ? [`live-smoke-evidence:code-graph-trace:${codeGraphTraceId}`] : []),
      ...(taskExecutionPlanId ? [`live-smoke-evidence:execution-plan:${taskExecutionPlanId}`] : []),
      ...(redactionStatus ? [`live-smoke-evidence:redaction:${redactionStatus}`] : []),
      ...(missing.length > 0 ? [`live-smoke-evidence:missing:${missing.join(",")}`] : []),
      "live-smoke-evidence:no-write:pass",
      "live-smoke-evidence:mutation-authority:not-granted",
    ],
  };
}
