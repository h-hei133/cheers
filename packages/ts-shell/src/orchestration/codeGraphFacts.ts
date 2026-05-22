import crypto from "node:crypto";

import type { ContextGraph, ContextGraphEdgeKind, ContextGraphNode } from "./contextGraph.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import type { TestImpactPlan } from "./testImpactPlan.js";

export type CodeGraphFactKind =
  | "file-node"
  | "symbol-node"
  | "import-edge"
  | "export-edge"
  | "call-reference-edge"
  | "test-edge"
  | "docs-edge"
  | "verification-candidate-edge"
  | "ownership-source-edge"
  | "omitted-candidate"
  | "staleness-fact";

export type CodeGraphFactSourceKind =
  | "context-graph"
  | "context-packet"
  | "test-impact"
  | "staleness-check";

export type CodeGraphConfidence = "high" | "medium" | "low";

export interface CodeGraphFact {
  readonly factId: string;
  readonly kind: CodeGraphFactKind;
  readonly sourceContextGraphId: string;
  readonly safeLabel: string;
  readonly sourceKind: CodeGraphFactSourceKind;
  readonly confidence: CodeGraphConfidence;
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly redactionStatus: "redacted-and-budgeted" | "raw-content-excluded";
  readonly fromLabel?: string;
  readonly toLabel?: string;
  readonly relation?: string;
  readonly omittedReason?: string;
  readonly stalenessReason?: string;
  readonly evidence: readonly string[];
}

export interface CodeGraphFacts {
  readonly sourceContextGraphId: string;
  readonly sourceContextPacketId?: string;
  readonly facts: readonly CodeGraphFact[];
  readonly mutationAuthority: "not-granted";
  readonly redactionStatus: "redacted-and-budgeted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function normalizeCodeGraphFacts(input: {
  readonly graph: ContextGraph;
  readonly contextPacket?: TargetedContextPacket;
  readonly testImpactPlan?: TestImpactPlan;
  readonly staleLabels?: readonly string[];
}): CodeGraphFacts {
  const staleLabels = new Set(input.staleLabels ?? []);
  const nodeFacts = input.graph.nodes.map((node) =>
    nodeToFact({
      graphId: input.graph.graphId,
      packetId: input.contextPacket?.packetId,
      node,
      freshness: staleLabels.has(node.pathLabel) ? "stale" : "fresh",
    }),
  );
  const nodeById = new Map(input.graph.nodes.map((node) => [node.nodeId, node]));
  const edgeFacts = input.graph.edges.map((edge, index) => {
    const from = nodeById.get(edge.fromNodeId);
    const to = nodeById.get(edge.toNodeId);
    return edgeToFact({
      graphId: input.graph.graphId,
      edgeKind: edge.kind,
      fromLabel: from?.pathLabel ?? edge.fromNodeId,
      toLabel: to?.pathLabel ?? edge.toNodeId,
      relation: edge.reason,
      index,
      freshness:
        staleLabels.has(from?.pathLabel ?? "") || staleLabels.has(to?.pathLabel ?? "")
          ? "stale"
          : "fresh",
    });
  });
  const verificationFacts =
    input.testImpactPlan?.likelyVerificationCommandCandidates.map((candidate, index) =>
      makeFact({
        graphId: input.graph.graphId,
        kind: "verification-candidate-edge",
        safeLabel: candidate.command,
        sourceKind: "test-impact",
        confidence: candidate.readiness === "ready" ? input.testImpactPlan?.confidence ?? "medium" : "low",
        freshness: "fresh",
        relation: candidate.reason,
        index,
        evidence: [
          `code-graph-fact:verification-candidate:${candidate.readiness}`,
          "code-graph-fact:command:not-executed",
        ],
      }),
    ) ?? [];
  const stalenessFacts = Array.from(staleLabels).map((label, index) =>
    makeFact({
      graphId: input.graph.graphId,
      kind: "staleness-fact",
      safeLabel: label,
      sourceKind: "staleness-check",
      confidence: "low",
      freshness: "stale",
      stalenessReason: "stale graph label supplied by freshness check",
      index,
      evidence: ["code-graph-fact:staleness:stale"],
    }),
  );
  const facts = [...nodeFacts, ...edgeFacts, ...verificationFacts, ...stalenessFacts];
  const replaySafeSummary = [
    `code-graph-facts graph=${input.graph.graphId}`,
    input.contextPacket ? `contextPacket=${input.contextPacket.packetId}` : undefined,
    `facts=${facts.length}`,
    `stale=${facts.filter((fact) => fact.freshness === "stale").length}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].filter(Boolean).join("; ");

  return {
    sourceContextGraphId: input.graph.graphId,
    ...(input.contextPacket ? { sourceContextPacketId: input.contextPacket.packetId } : {}),
    facts,
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary,
    evidence: [
      replaySafeSummary,
      `code-graph-facts:context-graph:${input.graph.graphId}`,
      ...(input.contextPacket ? [`code-graph-facts:context-packet:${input.contextPacket.packetId}`] : []),
      `code-graph-facts:count:${facts.length}`,
      "code-graph-facts:mutation-authority:not-granted",
      "code-graph-facts:raw-content-excluded",
    ],
  };
}

function nodeToFact(input: {
  readonly graphId: string;
  readonly packetId?: string;
  readonly node: ContextGraphNode;
  readonly freshness: CodeGraphFact["freshness"];
}): CodeGraphFact {
  const kind: CodeGraphFactKind =
    input.node.budgetStatus === "omitted"
      ? "omitted-candidate"
      : input.node.kind === "direct-export"
        ? "symbol-node"
        : "file-node";
  return makeFact({
    graphId: input.graphId,
    kind,
    safeLabel: input.node.pathLabel,
    sourceKind: input.node.sourceKind === "target-packet" && input.packetId ? "context-packet" : "context-graph",
    confidence: input.node.confidence,
    freshness: input.freshness,
    relation: input.node.relation,
    omittedReason: input.node.omissionReason,
    evidence: [
      `code-graph-fact:node:${input.node.kind}`,
      `code-graph-fact:budget:${input.node.budgetStatus}`,
    ],
  });
}

function edgeToFact(input: {
  readonly graphId: string;
  readonly edgeKind: ContextGraphEdgeKind;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly relation: string;
  readonly index: number;
  readonly freshness: CodeGraphFact["freshness"];
}): CodeGraphFact {
  return makeFact({
    graphId: input.graphId,
    kind: mapEdgeKind(input.edgeKind),
    safeLabel: `${input.fromLabel} -> ${input.toLabel}`,
    sourceKind: "context-graph",
    confidence: confidenceForEdge(input.edgeKind),
    freshness: input.freshness,
    fromLabel: input.fromLabel,
    toLabel: input.toLabel,
    relation: input.relation,
    index: input.index,
    evidence: [`code-graph-fact:edge:${input.edgeKind}`],
  });
}

function mapEdgeKind(kind: ContextGraphEdgeKind): CodeGraphFactKind {
  switch (kind) {
    case "imports":
      return "import-edge";
    case "exports-symbol":
      return "export-edge";
    case "calls-or-references":
      return "call-reference-edge";
    case "tests":
      return "test-edge";
    case "documents":
      return "docs-edge";
    case "sibling":
    case "heuristic-related":
      return "ownership-source-edge";
  }
}

function confidenceForEdge(kind: ContextGraphEdgeKind): CodeGraphConfidence {
  switch (kind) {
    case "imports":
    case "tests":
      return "high";
    case "exports-symbol":
    case "calls-or-references":
      return "medium";
    default:
      return "low";
  }
}

function makeFact(input: {
  readonly graphId: string;
  readonly kind: CodeGraphFactKind;
  readonly safeLabel: string;
  readonly sourceKind: CodeGraphFactSourceKind;
  readonly confidence: CodeGraphConfidence;
  readonly freshness: CodeGraphFact["freshness"];
  readonly fromLabel?: string;
  readonly toLabel?: string;
  readonly relation?: string;
  readonly omittedReason?: string;
  readonly stalenessReason?: string;
  readonly index?: number;
  readonly evidence: readonly string[];
}): CodeGraphFact {
  const factId = buildFactId(input.graphId, input.kind, input.safeLabel, input.index);
  return {
    factId,
    kind: input.kind,
    sourceContextGraphId: input.graphId,
    safeLabel: input.safeLabel,
    sourceKind: input.sourceKind,
    confidence: input.confidence,
    freshness: input.freshness,
    redactionStatus: "redacted-and-budgeted",
    ...(input.fromLabel ? { fromLabel: input.fromLabel } : {}),
    ...(input.toLabel ? { toLabel: input.toLabel } : {}),
    ...(input.relation ? { relation: input.relation } : {}),
    ...(input.omittedReason ? { omittedReason: input.omittedReason } : {}),
    ...(input.stalenessReason ? { stalenessReason: input.stalenessReason } : {}),
    evidence: [
      `code-graph-fact:id:${factId}`,
      `code-graph-fact:kind:${input.kind}`,
      `code-graph-fact:freshness:${input.freshness}`,
      ...input.evidence,
      "code-graph-fact:raw-content-excluded",
    ],
  };
}

function buildFactId(
  graphId: string,
  kind: CodeGraphFactKind,
  safeLabel: string,
  index: number | undefined,
): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${graphId}:${kind}:${safeLabel}:${index ?? 0}`)
    .digest("hex")
    .slice(0, 12);
  return `code_fact_${hash}`;
}
