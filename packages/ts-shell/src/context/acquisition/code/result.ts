import type { CodeGraphImpact } from "./impact.js";
import type { CodeGraphTrace } from "./trace.js";

export type CodeGraphResultOutcome =
  | "code-graph-trace-created"
  | "impact-query-ready"
  | "impact-query-partial-budget-limited"
  | "stale-graph-facts-detected"
  | "no-impact-candidates-found"
  | "test-impact-candidates-available"
  | "verification-candidates-available"
  | "needs-more-context";

export interface CodeGraphResultProjection {
  readonly outcome: CodeGraphResultOutcome;
  readonly output: string;
  readonly evidence: readonly string[];
}

export function buildCodeGraphResult(input: {
  readonly trace: CodeGraphTrace;
  readonly impact: CodeGraphImpact;
}): CodeGraphResultProjection {
  const outcome = classifyOutcome(input);
  const output = [
    `Code graph: ${outcome}`,
    `Trace id: ${input.trace.traceId}`,
    `Impact query id: ${input.impact.impactQueryId}`,
    `Root target: ${input.trace.rootTarget}`,
    `Nodes: files=${input.trace.nodeCounts.files}, symbols=${input.trace.nodeCounts.symbols}`,
    `Edges: imports=${input.trace.edgeCounts.imports}, callSites=${input.trace.edgeCounts.callSites}, tests=${input.trace.edgeCounts.tests}, docs=${input.trace.edgeCounts.docs}`,
    `Impact readiness: ${input.impact.readiness}`,
    `Impact confidence: ${input.impact.confidence}`,
    `Likely tests: ${input.impact.likelyTests.join(", ") || "none"}`,
    `Docs references: ${input.impact.docsReferences.join(", ") || "none"}`,
    `Stale context: ${input.impact.staleContext.join(", ") || "none"}`,
    `Omitted context: ${input.impact.omittedContext.join(", ") || "none"}`,
    `Suggested reads: ${input.impact.suggestedReads.join(", ") || "none"}`,
    `Suggested verification: ${input.impact.suggestedVerification.join(", ") || "none"}`,
    "Mutation authority: not-granted",
    "Raw content: excluded",
  ].join("\n");

  return {
    outcome,
    output,
    evidence: [
      input.trace.replaySafeSummary,
      input.impact.replaySafeSummary,
      ...input.trace.evidence,
      ...input.impact.evidence,
      `code-graph-result:${outcome}`,
      "code-graph-result:mutation-authority:not-granted",
      "code-graph-result:raw-content-excluded",
    ],
  };
}

function classifyOutcome(input: {
  readonly trace: CodeGraphTrace;
  readonly impact: CodeGraphImpact;
}): CodeGraphResultOutcome {
  if (input.impact.readiness === "stale-warning") {
    return "stale-graph-facts-detected";
  }
  if (input.impact.readiness === "no-impact-candidates") {
    return "no-impact-candidates-found";
  }
  if (input.impact.readiness === "needs-more-context") {
    return "needs-more-context";
  }
  if (input.impact.readiness === "impact-partial") {
    return "impact-query-partial-budget-limited";
  }
  if (input.impact.suggestedVerification.length > 0) {
    return "verification-candidates-available";
  }
  if (input.impact.likelyTests.length > 0) {
    return "test-impact-candidates-available";
  }
  if (input.trace.factIds.length > 0) {
    return "impact-query-ready";
  }
  return "code-graph-trace-created";
}
