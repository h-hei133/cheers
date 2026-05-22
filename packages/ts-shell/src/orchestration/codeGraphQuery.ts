import crypto from "node:crypto";

import type { CodeGraphFact, CodeGraphFactKind } from "./codeGraphFacts.js";
import type { CodeGraphTrace } from "./codeGraphTrace.js";

export type CodeGraphQueryType =
  | "impact-for-target"
  | "tests-for-target"
  | "call-sites-for-symbol"
  | "imports-for-target"
  | "docs-for-target"
  | "verification-candidates-for-target"
  | "omitted-context-for-target";

export interface CodeGraphQueryResult {
  readonly queryId: string;
  readonly type: CodeGraphQueryType;
  readonly traceId: string;
  readonly target: string;
  readonly candidates: readonly {
    readonly factId: string;
    readonly safeLabel: string;
    readonly kind: CodeGraphFactKind;
    readonly confidence: CodeGraphFact["confidence"];
    readonly freshness: CodeGraphFact["freshness"];
    readonly reason: string;
  }[];
  readonly readiness: "ready" | "partial" | "stale-warning" | "no-candidates";
  readonly mutationAuthority: "not-granted";
  readonly redactionStatus: "redacted-and-budgeted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function queryCodeGraphTrace(input: {
  readonly trace: CodeGraphTrace;
  readonly type: CodeGraphQueryType;
  readonly target: string;
  readonly symbolLabel?: string;
  readonly maxCandidates?: number;
}): CodeGraphQueryResult {
  const kinds = kindsForQuery(input.type);
  const target = input.target.trim() || input.trace.rootTarget;
  const symbolLabel = input.symbolLabel?.trim();
  const candidates = input.trace.facts
    .filter((fact) => kinds.includes(fact.kind))
    .filter((fact) => matchesTarget({ fact, target, symbolLabel, queryType: input.type }))
    .slice(0, input.maxCandidates ?? 12)
    .map((fact) => ({
      factId: fact.factId,
      safeLabel: fact.toLabel ?? fact.safeLabel,
      kind: fact.kind,
      confidence: fact.confidence,
      freshness: fact.freshness,
      reason: fact.relation ?? fact.omittedReason ?? fact.stalenessReason ?? fact.kind,
    }));
  const readiness =
    candidates.length === 0
      ? "no-candidates"
      : candidates.some((candidate) => candidate.freshness === "stale")
        ? "stale-warning"
        : input.trace.impactReadiness === "impact-partial"
          ? "partial"
          : "ready";
  const queryId = buildQueryId({
    traceId: input.trace.traceId,
    type: input.type,
    target,
    symbolLabel,
    candidates: candidates.map((candidate) => candidate.factId),
  });
  const replaySafeSummary = [
    `code-graph-query ${queryId}`,
    `trace=${input.trace.traceId}`,
    `type=${input.type}`,
    `target=${target}`,
    `candidates=${candidates.length}`,
    `readiness=${readiness}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].join("; ");

  return {
    queryId,
    type: input.type,
    traceId: input.trace.traceId,
    target,
    candidates,
    readiness,
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary,
    evidence: [
      replaySafeSummary,
      `code-graph-query:id:${queryId}`,
      `code-graph-query:type:${input.type}`,
      `code-graph-query:trace:${input.trace.traceId}`,
      `code-graph-query:readiness:${readiness}`,
      "code-graph-query:bounded-to-trace",
      "code-graph-query:mutation-authority:not-granted",
      "code-graph-query:raw-content-excluded",
    ],
  };
}

function kindsForQuery(type: CodeGraphQueryType): readonly CodeGraphFactKind[] {
  switch (type) {
    case "impact-for-target":
      return [
        "import-edge",
        "call-reference-edge",
        "test-edge",
        "docs-edge",
        "verification-candidate-edge",
        "omitted-candidate",
      ];
    case "tests-for-target":
      return ["test-edge"];
    case "call-sites-for-symbol":
      return ["call-reference-edge"];
    case "imports-for-target":
      return ["import-edge"];
    case "docs-for-target":
      return ["docs-edge"];
    case "verification-candidates-for-target":
      return ["verification-candidate-edge"];
    case "omitted-context-for-target":
      return ["omitted-candidate", "staleness-fact"];
  }
}

function matchesTarget(input: {
  readonly fact: CodeGraphFact;
  readonly target: string;
  readonly symbolLabel?: string;
  readonly queryType: CodeGraphQueryType;
}): boolean {
  if (input.queryType === "verification-candidates-for-target") {
    return true;
  }
  if (input.queryType === "omitted-context-for-target") {
    return true;
  }
  if (input.queryType === "call-sites-for-symbol" && input.symbolLabel) {
    return input.fact.safeLabel.includes(input.symbolLabel) ||
      input.fact.fromLabel?.includes(input.symbolLabel) === true ||
      input.fact.toLabel?.includes(input.symbolLabel) === true;
  }
  return input.fact.safeLabel.includes(input.target) ||
    input.fact.fromLabel === input.target ||
    input.fact.toLabel === input.target ||
    input.fact.sourceContextGraphId.includes(input.target) === true;
}

function buildQueryId(input: {
  readonly traceId: string;
  readonly type: CodeGraphQueryType;
  readonly target: string;
  readonly symbolLabel?: string;
  readonly candidates: readonly string[];
}): string {
  return `code_graph_query_${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12)}`;
}
