import crypto from "node:crypto";

import type { CodeGraphFact, CodeGraphFacts } from "./facts.js";
import type { ContextGraph } from "../../graph/contextGraph.js";
import type { TargetedContextPacket } from "../../graph/contextPacket.js";

export interface CodeGraphTrace {
  readonly traceId: string;
  readonly rootTarget: string;
  readonly sourceContextPacketId?: string;
  readonly sourceContextGraphId: string;
  readonly facts: readonly CodeGraphFact[];
  readonly factIds: readonly string[];
  readonly nodeCounts: {
    readonly files: number;
    readonly symbols: number;
  };
  readonly edgeCounts: {
    readonly imports: number;
    readonly exports: number;
    readonly callSites: number;
    readonly tests: number;
    readonly docs: number;
    readonly verificationCandidates: number;
    readonly ownership: number;
  };
  readonly includedSummary: readonly string[];
  readonly omittedSummary: readonly string[];
  readonly stalenessSummary: {
    readonly status: "fresh" | "stale" | "unknown";
    readonly staleFacts: number;
    readonly staleLabels: readonly string[];
  };
  readonly impactReadiness:
    | "impact-ready"
    | "impact-partial"
    | "stale-warning"
    | "needs-more-context";
  readonly redactionStatus: "redacted-and-budgeted";
  readonly mutationAuthority: "not-granted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildCodeGraphTrace(input: {
  readonly graph: ContextGraph;
  readonly facts: CodeGraphFacts;
  readonly contextPacket?: TargetedContextPacket;
}): CodeGraphTrace {
  const nodeCounts = {
    files: input.facts.facts.filter((fact) => fact.kind === "file-node").length,
    symbols: input.facts.facts.filter((fact) => fact.kind === "symbol-node").length,
  };
  const edgeCounts = {
    imports: countFacts(input.facts.facts, "import-edge"),
    exports: countFacts(input.facts.facts, "export-edge"),
    callSites: countFacts(input.facts.facts, "call-reference-edge"),
    tests: countFacts(input.facts.facts, "test-edge"),
    docs: countFacts(input.facts.facts, "docs-edge"),
    verificationCandidates: countFacts(input.facts.facts, "verification-candidate-edge"),
    ownership: countFacts(input.facts.facts, "ownership-source-edge"),
  };
  const staleLabels = Array.from(
    new Set(
      input.facts.facts
        .filter((fact) => fact.freshness === "stale")
        .map((fact) => fact.safeLabel),
    ),
  );
  const stalenessSummary = {
    status: staleLabels.length > 0
      ? "stale" as const
      : input.facts.facts.some((fact) => fact.freshness === "unknown")
        ? "unknown" as const
        : "fresh" as const,
    staleFacts: input.facts.facts.filter((fact) => fact.freshness === "stale").length,
    staleLabels,
  };
  const impactReadiness =
    stalenessSummary.status === "stale"
      ? "stale-warning"
      : edgeCounts.tests > 0 || edgeCounts.imports > 0 || edgeCounts.callSites > 0
        ? input.graph.omittedCandidates.length > 0
          ? "impact-partial"
          : "impact-ready"
        : "needs-more-context";
  const traceId = buildTraceId({
    graphId: input.graph.graphId,
    packetId: input.contextPacket?.packetId,
    factIds: input.facts.facts.map((fact) => fact.factId),
    staleness: stalenessSummary.status,
  });
  const includedSummary = input.graph.includedCandidates
    .slice(0, 12)
    .map((node) => `${node.kind}:${node.pathLabel}`);
  const omittedSummary = input.graph.omittedCandidates
    .slice(0, 12)
    .map((node) => `${node.omissionReason ?? "omitted"}:${node.pathLabel}`);
  const replaySafeSummary = [
    `code-graph-trace ${traceId}`,
    `root=${input.graph.rootTarget}`,
    `contextGraph=${input.graph.graphId}`,
    input.contextPacket ? `contextPacket=${input.contextPacket.packetId}` : undefined,
    `facts=${input.facts.facts.length}`,
    `files=${nodeCounts.files}`,
    `symbols=${nodeCounts.symbols}`,
    `tests=${edgeCounts.tests}`,
    `docs=${edgeCounts.docs}`,
    `callSites=${edgeCounts.callSites}`,
    `freshness=${stalenessSummary.status}`,
    `readiness=${impactReadiness}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].filter(Boolean).join("; ");

  return {
    traceId,
    rootTarget: input.graph.rootTarget,
    ...(input.contextPacket ? { sourceContextPacketId: input.contextPacket.packetId } : {}),
    sourceContextGraphId: input.graph.graphId,
    facts: input.facts.facts,
    factIds: input.facts.facts.map((fact) => fact.factId),
    nodeCounts,
    edgeCounts,
    includedSummary,
    omittedSummary,
    stalenessSummary,
    impactReadiness,
    redactionStatus: "redacted-and-budgeted",
    mutationAuthority: "not-granted",
    replaySafeSummary,
    evidence: [
      replaySafeSummary,
      ...input.facts.evidence,
      `code-graph-trace:id:${traceId}`,
      `code-graph-trace:context-graph:${input.graph.graphId}`,
      ...(input.contextPacket ? [`code-graph-trace:context-packet:${input.contextPacket.packetId}`] : []),
      `code-graph-trace:freshness:${stalenessSummary.status}`,
      `code-graph-trace:impact-readiness:${impactReadiness}`,
      "code-graph-trace:mutation-authority:not-granted",
      "code-graph-trace:raw-content-excluded",
    ],
  };
}

function countFacts(
  facts: readonly CodeGraphFact[],
  kind: CodeGraphFact["kind"],
): number {
  return facts.filter((fact) => fact.kind === kind).length;
}

function buildTraceId(input: {
  readonly graphId: string;
  readonly packetId?: string;
  readonly factIds: readonly string[];
  readonly staleness: string;
}): string {
  return `code_graph_trace_${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12)}`;
}
