import type { ContextGraph } from "./contextGraph.js";
import type { ContextGraphScore } from "./contextGraphScore.js";
import type { TestImpactPlan } from "../../planning/task/testImpactPlan.js";

export type ContextGraphReadinessState =
  | "ready"
  | "partial"
  | "low-confidence"
  | "budget-limited"
  | "unsupported";

export type TestImpactReadinessState =
  | "ready"
  | "missing"
  | "not-allowlisted"
  | "low-confidence";

export interface ContextGraphReadinessFacts {
  readonly graphId: string;
  readonly graphReadiness: ContextGraphReadinessState;
  readonly testImpactReadiness: TestImpactReadinessState;
  readonly rootTargetConfidence: ContextGraphScore["rootTargetConfidence"];
  readonly reverseCallSiteConfidence: "high" | "medium" | "low" | "missing";
  readonly importCoverage: number;
  readonly callSiteCoverage: number;
  readonly testCoverage: number;
  readonly docsCoverage: number;
  readonly omittedRiskLevel: ContextGraphScore["omittedRiskLevel"];
  readonly omittedRiskSummary: string;
  readonly staleRefreshNeed: "not-evaluated" | "refresh-suggested";
  readonly missingFacts: readonly string[];
  readonly suggestedReads: readonly string[];
  readonly evidence: readonly string[];
}

export function buildContextGraphReadinessFacts(input: {
  readonly graph: ContextGraph;
  readonly score: ContextGraphScore;
  readonly testImpactPlan?: TestImpactPlan;
}): ContextGraphReadinessFacts {
  const graphReadiness = mapGraphReadiness(input.score.planningReadiness);
  const testImpactReadiness = mapTestImpactReadiness(input.testImpactPlan);
  const reverseCallSiteConfidence = classifyReverseCallSiteConfidence(input.graph);
  const omittedRiskSummary = summarizeOmittedRisk(input.graph, input.score);
  const missingFacts = [
    ...(graphReadiness === "partial" ? ["context graph needs more context"] : []),
    ...(graphReadiness === "budget-limited" ? ["context graph budget limited"] : []),
    ...(graphReadiness === "low-confidence" ? ["context graph low confidence"] : []),
    ...(graphReadiness === "unsupported" ? ["context graph unsupported"] : []),
    ...(testImpactReadiness === "missing" ? ["test-impact plan missing"] : []),
    ...(testImpactReadiness === "not-allowlisted"
      ? ["test-impact verification command not allowlisted"]
      : []),
    ...(testImpactReadiness === "low-confidence" ? ["test-impact low confidence"] : []),
    ...(reverseCallSiteConfidence === "missing" ? ["reverse call-site context missing"] : []),
  ];

  return {
    graphId: input.graph.graphId,
    graphReadiness,
    testImpactReadiness,
    rootTargetConfidence: input.score.rootTargetConfidence,
    reverseCallSiteConfidence,
    importCoverage: input.score.importCoverage,
    callSiteCoverage: input.score.callSiteCoverage,
    testCoverage: input.score.testCoverage,
    docsCoverage: input.score.docsCoverage,
    omittedRiskLevel: input.score.omittedRiskLevel,
    omittedRiskSummary,
    staleRefreshNeed: input.graph.omittedCandidates.length > 0 ? "refresh-suggested" : "not-evaluated",
    missingFacts,
    suggestedReads: input.testImpactPlan?.suggestedReads ?? [],
    evidence: [
      `context-graph-readiness:graph:${input.graph.graphId}`,
      `context-graph-readiness:graph-state:${graphReadiness}`,
      `context-graph-readiness:test-impact:${testImpactReadiness}`,
      `context-graph-readiness:reverse-call-site:${reverseCallSiteConfidence}`,
      `context-graph-readiness:omitted-risk:${input.score.omittedRiskLevel}`,
      "context-graph-readiness:mutation-authority:not-granted",
      "context-graph-readiness:raw-content-excluded",
    ],
  };
}

function mapGraphReadiness(readiness: ContextGraphScore["planningReadiness"]): ContextGraphReadinessState {
  switch (readiness) {
    case "context-ready":
      return "ready";
    case "needs-more-context":
      return "partial";
    case "budget-limited":
      return "budget-limited";
    case "low-confidence":
      return "low-confidence";
    case "unsupported":
      return "unsupported";
  }
}

function mapTestImpactReadiness(
  testImpact: TestImpactPlan | undefined,
): TestImpactReadinessState {
  if (!testImpact) {
    return "missing";
  }
  if (testImpact.commandReadiness === "not-allowlisted") {
    return "not-allowlisted";
  }
  if (testImpact.commandReadiness === "missing-verification") {
    return "missing";
  }
  if (testImpact.confidence === "low") {
    return "low-confidence";
  }
  return "ready";
}

function classifyReverseCallSiteConfidence(graph: ContextGraph): ContextGraphReadinessFacts["reverseCallSiteConfidence"] {
  const callSites = graph.includedCandidates.filter((node) => node.kind === "reverse-call-site");
  if (callSites.length === 0) {
    return "missing";
  }
  if (callSites.some((node) => node.confidence === "high")) {
    return "high";
  }
  if (callSites.some((node) => node.confidence === "medium")) {
    return "medium";
  }
  return "low";
}

function summarizeOmittedRisk(graph: ContextGraph, score: ContextGraphScore): string {
  if (graph.omittedCandidates.length === 0) {
    return "none";
  }
  const reasons = Array.from(
    new Set(graph.omittedCandidates.map((node) => node.omissionReason ?? "unknown")),
  ).slice(0, 4);
  return `${score.omittedRiskLevel}:${reasons.join(",")}`;
}
