import crypto from "node:crypto";

import type { AgentPlan } from "./agentPlan.js";
import type { TaskIntent } from "./taskIntent.js";
import type { TaskReadPlan } from "./taskReadPlan.js";

export type AnalysisBriefConfidence = "high" | "medium" | "low";

export interface AnalysisBriefObservation {
  readonly claim: string;
  readonly evidenceIds: readonly string[];
}

export interface AnalysisBrief {
  readonly briefId: string;
  readonly taskId: string;
  readonly observations: readonly AnalysisBriefObservation[];
  readonly hypotheses: readonly AnalysisBriefObservation[];
  readonly supportingEvidenceIds: readonly string[];
  readonly rejectedAlternatives: readonly AnalysisBriefObservation[];
  readonly risks: readonly string[];
  readonly missingFacts: readonly string[];
  readonly recommendedStrategy: string;
  readonly verificationExpectation: string;
  readonly confidence: AnalysisBriefConfidence;
  readonly redactionStatus: "redacted-and-budgeted";
  readonly mutationAuthority: "not-granted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildAnalysisBrief(input: {
  readonly intent: TaskIntent;
  readonly readPlan: TaskReadPlan;
  readonly agentPlan?: AgentPlan;
  readonly observations?: readonly AnalysisBriefObservation[];
  readonly hypotheses?: readonly AnalysisBriefObservation[];
  readonly rejectedAlternatives?: readonly AnalysisBriefObservation[];
  readonly risks?: readonly string[];
  readonly missingFacts?: readonly string[];
  readonly recommendedStrategy?: string;
  readonly verificationExpectation?: string;
  readonly confidence?: AnalysisBriefConfidence;
}): AnalysisBrief {
  const supportingEvidenceIds = unique([
    input.intent.taskId,
    input.readPlan.readPlanId,
    ...(input.agentPlan ? [input.agentPlan.planId] : []),
    ...input.readPlan.evidence,
    ...(input.agentPlan?.safeEvidenceMarkers ?? []),
  ]);
  const missingFacts = unique([
    ...input.intent.missingTargetFacts,
    ...input.readPlan.suggestedNextReads,
    ...(input.agentPlan?.missingFacts ?? []),
    ...(input.missingFacts ?? []),
  ]);
  const observations =
    input.observations ??
    [
      {
        claim: `Task intent is ${input.intent.kind} with ${input.intent.requiredStages.length} required stages.`,
        evidenceIds: [input.intent.taskId, ...input.intent.evidence.slice(0, 2)],
      },
      {
        claim: `Read plan has ${input.readPlan.requiredReads.length} required reads and ${input.readPlan.optionalReads.length} optional reads.`,
        evidenceIds: [input.readPlan.readPlanId, ...input.readPlan.evidence.slice(0, 2)],
      },
    ];
  const hypotheses =
    input.hypotheses ??
    [
      {
        claim:
          missingFacts.length === 0
            ? "Evidence is sufficient for a reviewable plan."
            : "More read evidence is required before provider proposal or edit handoff.",
        evidenceIds: supportingEvidenceIds.slice(0, 6),
      },
    ];
  const rejectedAlternatives =
    input.rejectedAlternatives ??
    [
      {
        claim: "Do not infer mutation authority from lifecycle, read, analysis, or planning evidence.",
        evidenceIds: ["task-intent:mutation-authority:not-granted", "task-read-plan:mutation-authority:not-granted"],
      },
    ];
  const confidence =
    input.confidence ??
    (missingFacts.length > 0 ? "low" : input.agentPlan?.confidence ?? "medium");
  const recommendedStrategy =
    input.recommendedStrategy ??
    (missingFacts.length > 0
      ? "Resolve missing read evidence, then rebuild the execution plan."
      : "Proceed to reviewable proposal, verification planning, or existing gated edit handoff.");
  const verificationExpectation =
    input.verificationExpectation ??
    (input.agentPlan?.suggestedVerification[0] ??
      input.readPlan.likelyTestReads[0] ??
      "attach an explicit verification expectation before verification readiness");
  const briefId = buildBriefId({
    taskId: input.intent.taskId,
    readPlanId: input.readPlan.readPlanId,
    agentPlanId: input.agentPlan?.planId,
    missingFacts,
    confidence,
    verificationExpectation,
  });
  const replaySafeSummary = [
    `analysis-brief ${briefId}`,
    `task=${input.intent.taskId}`,
    `readPlan=${input.readPlan.readPlanId}`,
    input.agentPlan ? `agentPlan=${input.agentPlan.planId}` : undefined,
    `confidence=${confidence}`,
    `observations=${observations.length}`,
    `missingFacts=${missingFacts.length}`,
    `verification=${verificationExpectation}`,
    "mutationAuthority=not-granted",
    "hidden-cot-excluded",
  ].filter(Boolean).join("; ");

  return {
    briefId,
    taskId: input.intent.taskId,
    observations,
    hypotheses,
    supportingEvidenceIds,
    rejectedAlternatives,
    risks: input.risks ?? input.readPlan.omittedReasons,
    missingFacts,
    recommendedStrategy,
    verificationExpectation,
    confidence,
    redactionStatus: "redacted-and-budgeted",
    mutationAuthority: "not-granted",
    replaySafeSummary,
    evidence: [
      `analysis-brief:id:${briefId}`,
      `analysis-brief:task:${input.intent.taskId}`,
      `analysis-brief:read-plan:${input.readPlan.readPlanId}`,
      ...(input.agentPlan ? [`analysis-brief:agent-plan:${input.agentPlan.planId}`] : []),
      `analysis-brief:confidence:${confidence}`,
      `analysis-brief:missing-facts:${missingFacts.length}`,
      "analysis-brief:evidence-grounded",
      "analysis-brief:hidden-cot-excluded",
      "analysis-brief:raw-content-excluded",
      "analysis-brief:mutation-authority:not-granted",
      "analysis-brief:redacted-and-budgeted",
    ],
  };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => Boolean(value.trim()))));
}

function buildBriefId(input: object): string {
  return `analysis_brief_${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12)}`;
}
