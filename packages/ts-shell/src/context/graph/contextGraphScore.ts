import type { ContextGraph } from "./contextGraph.js";

export type ContextGraphReadiness =
  | "context-ready"
  | "needs-more-context"
  | "budget-limited"
  | "low-confidence"
  | "unsupported";

export interface ContextGraphScore {
  readonly graphId: string;
  readonly rootTargetConfidence: "high" | "medium" | "low";
  readonly importCoverage: number;
  readonly testCoverage: number;
  readonly docsCoverage: number;
  readonly callSiteCoverage: number;
  readonly omittedRiskLevel: "none" | "low" | "medium" | "high";
  readonly planningReadiness: ContextGraphReadiness;
  readonly coverageScore: number;
  readonly evidence: readonly string[];
}

export function scoreContextGraph(graph: ContextGraph): ContextGraphScore {
  const included = graph.includedCandidates;
  const omitted = graph.omittedCandidates;
  const root = included.find((node) => node.kind === "root-target");
  const importCoverage = included.some((node) => node.kind === "direct-import") ? 1 : 0;
  const testCoverage = included.some((node) => node.kind === "nearby-test") ? 1 : 0;
  const docsCoverage = included.some((node) => node.kind === "docs-readme") ? 1 : 0;
  const callSiteCoverage = included.some((node) => node.kind === "reverse-call-site") ? 1 : 0;
  const omittedRiskLevel = classifyOmittedRisk(graph);
  const coverageScore = Math.round(
    ((importCoverage * 30) + (testCoverage * 30) + (docsCoverage * 15) + (callSiteCoverage * 15) +
      (included.some((node) => node.kind === "second-hop-candidate") ? 10 : 0)) *
      (omittedRiskLevel === "high" ? 0.65 : omittedRiskLevel === "medium" ? 0.8 : 1),
  );
  const planningReadiness = classifyReadiness({
    graph,
    omittedRiskLevel,
    coverageScore,
  });

  return {
    graphId: graph.graphId,
    rootTargetConfidence: root?.confidence ?? "low",
    importCoverage,
    testCoverage,
    docsCoverage,
    callSiteCoverage,
    omittedRiskLevel,
    planningReadiness,
    coverageScore,
    evidence: [
      `context-graph-score:graph:${graph.graphId}`,
      `context-graph-score:readiness:${planningReadiness}`,
      `context-graph-score:coverage:${coverageScore}`,
      `context-graph-score:omitted-risk:${omittedRiskLevel}`,
    ],
  };
}

function classifyReadiness(input: {
  readonly graph: ContextGraph;
  readonly omittedRiskLevel: ContextGraphScore["omittedRiskLevel"];
  readonly coverageScore: number;
}): ContextGraphReadiness {
  if (!input.graph.includedCandidates.some((node) => node.kind === "root-target")) {
    return "unsupported";
  }
  if (
    input.graph.omittedCandidates.some((node) =>
      node.omissionReason === "over-byte-budget" ||
      node.omissionReason === "over-file-budget" ||
      node.omissionReason === "over-node-budget" ||
      node.omissionReason === "over-depth",
    )
  ) {
    return "budget-limited";
  }
  if (input.omittedRiskLevel === "high" || input.coverageScore < 35) {
    return "low-confidence";
  }
  if (input.coverageScore < 65) {
    return "needs-more-context";
  }
  return "context-ready";
}

function classifyOmittedRisk(graph: ContextGraph): ContextGraphScore["omittedRiskLevel"] {
  if (graph.omittedCandidates.length === 0) {
    return "none";
  }
  if (
    graph.omittedCandidates.some((node) =>
      node.omissionReason === "secret-risk" ||
      node.omissionReason === "out-of-workspace" ||
      node.omissionReason === "ambiguous-symbol",
    )
  ) {
    return "high";
  }
  if (
    graph.omittedCandidates.some((node) =>
      node.omissionReason === "over-byte-budget" ||
      node.omissionReason === "over-file-budget" ||
      node.omissionReason === "over-node-budget",
    )
  ) {
    return "medium";
  }
  return "low";
}
