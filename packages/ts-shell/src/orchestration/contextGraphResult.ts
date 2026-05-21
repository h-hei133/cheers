import type { ContextGraph } from "./contextGraph.js";
import type { ContextGraphScore } from "./contextGraphScore.js";
import type { TestImpactPlan } from "./testImpactPlan.js";

export type ContextGraphTerminalOutcome =
  | "context-graph-created"
  | "context-graph-partial-budget-limited"
  | "no-related-context-found"
  | "test-impact-plan-created"
  | "verification-candidates-suggested"
  | "needs-more-context"
  | "unsupported-graph-discovery";

export interface ContextGraphResultProjection {
  readonly outcome: ContextGraphTerminalOutcome;
  readonly output: string;
  readonly evidence: readonly string[];
}

export function buildContextGraphResult(input: {
  readonly graph: ContextGraph;
  readonly score: ContextGraphScore;
  readonly testImpact: TestImpactPlan;
}): ContextGraphResultProjection {
  const outcome = classifyOutcome(input);
  const omittedReasons = Array.from(
    new Set(input.graph.omittedCandidates.map((node) => node.omissionReason ?? "low-confidence")),
  );
  const output = [
    `Context graph: ${outcome}`,
    `Graph id: ${input.graph.graphId}`,
    `Root target: ${input.graph.rootTarget}`,
    `Included nodes: ${input.graph.includedCandidates.length}`,
    `Omitted nodes: ${input.graph.omittedCandidates.length}`,
    `Omitted reasons: ${omittedReasons.join(", ") || "none"}`,
    `Coverage score: ${input.score.coverageScore}`,
    `Graph readiness: ${input.score.planningReadiness}`,
    `Likely tests: ${input.testImpact.likelyTestFiles.join(", ") || "none"}`,
    `Suggested reads: ${input.testImpact.suggestedReads.join(", ") || "none"}`,
    `Suggested verification: ${
      input.testImpact.likelyVerificationCommandCandidates.map((candidate) => candidate.command).join(", ") || "none"
    }`,
    "Mutation authority: not-granted",
    "Raw content: excluded",
  ].join("\n");

  return {
    outcome,
    output,
    evidence: [
      input.graph.replaySafeSummary,
      input.testImpact.replaySafeSummary,
      ...input.graph.evidence,
      ...input.score.evidence,
      ...input.testImpact.evidence,
      `context-graph-result:${outcome}`,
      "context-graph-result:mutation-authority:not-granted",
      "context-graph-result:raw-content-excluded",
    ],
  };
}

function classifyOutcome(input: {
  readonly graph: ContextGraph;
  readonly score: ContextGraphScore;
  readonly testImpact: TestImpactPlan;
}): ContextGraphTerminalOutcome {
  if (input.score.planningReadiness === "unsupported") {
    return "unsupported-graph-discovery";
  }
  if (input.score.planningReadiness === "budget-limited") {
    return "context-graph-partial-budget-limited";
  }
  if (input.graph.includedCandidates.length <= 1) {
    return "no-related-context-found";
  }
  if (input.testImpact.commandReadiness === "ready") {
    return "verification-candidates-suggested";
  }
  if (input.testImpact.likelyTestFiles.length > 0) {
    return "test-impact-plan-created";
  }
  if (input.score.planningReadiness !== "context-ready") {
    return "needs-more-context";
  }
  return "context-graph-created";
}
