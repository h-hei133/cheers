import crypto from "node:crypto";

import type { CodeGraphImpact } from "../../context/acquisition/code/impact.js";
import type { CodeGraphStalenessCheck } from "../../context/acquisition/code/staleness.js";
import type { ContextGraphScore } from "../../context/graph/contextGraphScore.js";
import type { TargetedContextPacket } from "../../context/graph/contextPacket.js";
import type { TaskContextAcquisition } from "./taskContextAcquisition.js";
import type { TaskContextNeedSet } from "./taskContextNeed.js";
import type { TestImpactPlan } from "../../orchestration/testImpactPlan.js";

export type TaskContextSufficiencyState =
  | "sufficient"
  | "needs-required-context"
  | "needs-optional-context"
  | "budget-limited"
  | "low-confidence"
  | "stale-context"
  | "unsupported";

export interface TaskContextSufficiency {
  readonly sufficiencyId: string;
  readonly taskId: string;
  readonly needSetId: string;
  readonly acquisitionId?: string;
  readonly state: TaskContextSufficiencyState;
  readonly analysisReadiness: "ready" | "not-ready";
  readonly providerProposalReadiness: "ready" | "review-only" | "blocked";
  readonly verificationPlanningReadiness: "ready" | "downgraded" | "blocked";
  readonly editApplyReadiness: "not-granted";
  readonly repairProposalReadiness: "ready" | "blocked";
  readonly missingRequiredFacts: readonly string[];
  readonly missingOptionalFacts: readonly string[];
  readonly staleFacts: readonly string[];
  readonly omittedReasons: readonly string[];
  readonly suggestedReads: readonly string[];
  readonly suggestedVerification: readonly string[];
  readonly readinessDowngrade: string;
  readonly replaySafeSummary: string;
  readonly mutationAuthority: "not-granted";
  readonly evidence: readonly string[];
}

export function evaluateTaskContextSufficiency(input: {
  readonly needSet: TaskContextNeedSet;
  readonly acquisition?: TaskContextAcquisition;
  readonly contextPacket?: TargetedContextPacket;
  readonly contextGraphScore?: ContextGraphScore;
  readonly testImpactPlan?: TestImpactPlan;
  readonly codeGraphImpact?: CodeGraphImpact;
  readonly codeGraphStaleness?: CodeGraphStalenessCheck;
}): TaskContextSufficiency {
  const missingRequiredFacts = input.needSet.needs
    .filter((need) => need.required && need.readiness !== "available")
    .map((need) => `${need.kind}: ${need.omittedReason ?? "missing"}`);
  const missingOptionalFacts = input.needSet.needs
    .filter((need) => !need.required && need.readiness !== "available")
    .map((need) => `${need.kind}: ${need.omittedReason ?? "missing"}`);
  const staleFacts = [
    ...(input.codeGraphStaleness?.staleLabels ?? []),
    ...(input.codeGraphImpact?.staleContext ?? []),
  ];
  const omittedReasons = Array.from(new Set([
    ...(input.contextPacket?.omittedCandidateSummaries.map((candidate) => candidate.reason ?? candidate.kind) ?? []),
    ...(input.codeGraphImpact?.omittedContext ?? []),
    ...(input.contextGraphScore?.omittedRiskLevel && input.contextGraphScore.omittedRiskLevel !== "none"
      ? [`context graph omitted risk ${input.contextGraphScore.omittedRiskLevel}`]
      : []),
  ]));
  const state = classifyState({
    missingRequiredFacts,
    missingOptionalFacts,
    staleFacts,
    contextPacket: input.contextPacket,
    contextGraphScore: input.contextGraphScore,
    testImpactPlan: input.testImpactPlan,
    codeGraphImpact: input.codeGraphImpact,
  });
  const suggestedReads = Array.from(new Set([
    ...(input.acquisition?.suggestedReads ?? []),
    ...(input.testImpactPlan?.suggestedReads ?? []),
    ...(input.codeGraphImpact?.suggestedReads ?? []),
  ]));
  const suggestedVerification = Array.from(new Set([
    ...(input.acquisition?.suggestedVerification ?? []),
    ...(input.codeGraphImpact?.suggestedVerification ?? []),
  ]));
  const sufficiencyId = `task_context_sufficiency_${hash({
    needSetId: input.needSet.needSetId,
    acquisitionId: input.acquisition?.acquisitionId,
    state,
    missingRequiredFacts,
    missingOptionalFacts,
    staleFacts,
  })}`;
  const providerProposalReadiness =
    state === "sufficient" ? "ready" : state === "needs-optional-context" ? "review-only" : "blocked";
  const verificationPlanningReadiness =
    input.testImpactPlan?.commandReadiness === "ready" && state !== "needs-required-context" && state !== "stale-context"
      ? "ready"
      : missingRequiredFacts.length > 0
        ? "blocked"
        : "downgraded";
  const repairProposalReadiness =
    missingRequiredFacts.length === 0 && state !== "stale-context" && state !== "unsupported"
      ? "ready"
      : "blocked";
  const readinessDowngrade = buildDowngrade(state);
  const replaySafeSummary = [
    `task-context-sufficiency ${sufficiencyId}`,
    `task=${input.needSet.taskId}`,
    `state=${state}`,
    `missingRequired=${missingRequiredFacts.length}`,
    `missingOptional=${missingOptionalFacts.length}`,
    `stale=${staleFacts.length}`,
    `provider=${providerProposalReadiness}`,
    `verification=${verificationPlanningReadiness}`,
    "editApply=not-granted",
  ].join("; ");

  return {
    sufficiencyId,
    taskId: input.needSet.taskId,
    needSetId: input.needSet.needSetId,
    ...(input.acquisition ? { acquisitionId: input.acquisition.acquisitionId } : {}),
    state,
    analysisReadiness: state === "unsupported" || missingRequiredFacts.length > 0 ? "not-ready" : "ready",
    providerProposalReadiness,
    verificationPlanningReadiness,
    editApplyReadiness: "not-granted",
    repairProposalReadiness,
    missingRequiredFacts,
    missingOptionalFacts,
    staleFacts,
    omittedReasons,
    suggestedReads,
    suggestedVerification,
    readinessDowngrade,
    replaySafeSummary,
    mutationAuthority: "not-granted",
    evidence: [
      `task-context-sufficiency:id:${sufficiencyId}`,
      `task-context-sufficiency:state:${state}`,
      `task-context-sufficiency:missing-required:${missingRequiredFacts.length}`,
      `task-context-sufficiency:missing-optional:${missingOptionalFacts.length}`,
      `task-context-sufficiency:stale:${staleFacts.length}`,
      `task-context-sufficiency:provider:${providerProposalReadiness}`,
      `task-context-sufficiency:verification:${verificationPlanningReadiness}`,
      "task-context-sufficiency:edit-apply:not-granted",
      "task-context-sufficiency:mutation-authority:not-granted",
      "task-context-sufficiency:provider-call:not-run",
      "task-context-sufficiency:command-dispatch:not-run",
    ],
  };
}

function classifyState(input: {
  readonly missingRequiredFacts: readonly string[];
  readonly missingOptionalFacts: readonly string[];
  readonly staleFacts: readonly string[];
  readonly contextPacket?: TargetedContextPacket;
  readonly contextGraphScore?: ContextGraphScore;
  readonly testImpactPlan?: TestImpactPlan;
  readonly codeGraphImpact?: CodeGraphImpact;
}): TaskContextSufficiencyState {
  if (input.contextGraphScore?.planningReadiness === "unsupported") return "unsupported";
  if (input.missingRequiredFacts.length > 0) return "needs-required-context";
  if (input.staleFacts.length > 0 || input.codeGraphImpact?.readiness === "stale-warning") return "stale-context";
  if (input.contextGraphScore?.planningReadiness === "budget-limited") return "budget-limited";
  if (input.contextGraphScore?.planningReadiness === "low-confidence" || input.contextPacket?.completenessStatus === "missing-context") return "low-confidence";
  if (input.missingOptionalFacts.length > 0 || input.testImpactPlan?.commandReadiness === "missing-verification") return "needs-optional-context";
  return "sufficient";
}

function buildDowngrade(state: TaskContextSufficiencyState): string {
  switch (state) {
    case "sufficient":
      return "none";
    case "needs-required-context":
      return "block provider, verification, edit apply, and repair until required context is read";
    case "needs-optional-context":
      return "allow review-only planning and downgrade verification readiness";
    case "budget-limited":
      return "block downstream planning until bounded context is reduced";
    case "low-confidence":
      return "downgrade provider and verification readiness until stronger context is acquired";
    case "stale-context":
      return "block downstream planning until stale context is refreshed";
    case "unsupported":
      return "stop unsupported task context route";
  }
}

function hash(input: object): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12);
}
