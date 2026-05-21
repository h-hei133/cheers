import crypto from "node:crypto";

export type ContextGraphNodeKind =
  | "root-target"
  | "direct-import"
  | "direct-export"
  | "sibling-file"
  | "nearby-test"
  | "docs-readme"
  | "reverse-call-site"
  | "second-hop-candidate"
  | "omitted-candidate";

export type ContextGraphEdgeKind =
  | "imports"
  | "exports-symbol"
  | "calls-or-references"
  | "tests"
  | "documents"
  | "sibling"
  | "heuristic-related";

export type ContextGraphSourceKind =
  | "target-packet"
  | "import-scan"
  | "export-symbol-scan"
  | "sibling-scan"
  | "test-convention"
  | "docs-scan"
  | "text-reference-scan"
  | "second-hop-scan";

export type ContextGraphOmissionReason =
  | "over-depth"
  | "over-node-budget"
  | "over-file-budget"
  | "over-byte-budget"
  | "unsupported-file-type"
  | "binary-or-unreadable"
  | "out-of-workspace"
  | "secret-risk"
  | "ambiguous-symbol"
  | "duplicate-candidate"
  | "low-confidence";

export interface ContextGraphNode {
  readonly nodeId: string;
  readonly kind: ContextGraphNodeKind;
  readonly pathLabel: string;
  readonly relation: string;
  readonly sourceKind: ContextGraphSourceKind;
  readonly depth: 0 | 1 | 2;
  readonly reason: string;
  readonly budgetStatus: "included" | "omitted";
  readonly confidence: "high" | "medium" | "low";
  readonly redactionStatus: "redacted-and-budgeted" | "raw-content-excluded";
  readonly summary?: string;
  readonly omissionReason?: ContextGraphOmissionReason;
}

export interface ContextGraphEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: ContextGraphEdgeKind;
  readonly reason: string;
}

export interface ContextGraphEdgeInput {
  readonly fromPathLabel: string;
  readonly toPathLabel: string;
  readonly kind: ContextGraphEdgeKind;
  readonly reason: string;
}

export interface ContextGraph {
  readonly graphId: string;
  readonly rootTarget: string;
  readonly rootPacketId?: string;
  readonly nodes: readonly ContextGraphNode[];
  readonly edges: readonly ContextGraphEdge[];
  readonly includedCandidates: readonly ContextGraphNode[];
  readonly omittedCandidates: readonly ContextGraphNode[];
  readonly mutationAuthority: "not-granted";
  readonly redactionStatus: "redacted-and-budgeted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildContextGraph(input: {
  readonly rootTarget: string;
  readonly rootPacketId?: string;
  readonly nodes: readonly Omit<ContextGraphNode, "nodeId">[];
  readonly edges: readonly ContextGraphEdgeInput[];
}): ContextGraph {
  const nodes = input.nodes.map((node, index) => ({
    ...node,
    nodeId: buildNodeId(node.pathLabel, node.kind, index),
  }));
  const byLabel = new Map(nodes.map((node) => [node.pathLabel, node.nodeId]));
  const edges = input.edges
    .map((edge) => {
      const fromNodeId = byLabel.get(edge.fromPathLabel);
      const toNodeId = byLabel.get(edge.toPathLabel);
      if (!fromNodeId || !toNodeId) {
        return undefined;
      }
      return {
        fromNodeId,
        toNodeId,
        kind: edge.kind,
        reason: edge.reason,
      };
    })
    .filter((edge): edge is ContextGraphEdge => Boolean(edge));
  const includedCandidates = nodes.filter((node) => node.budgetStatus === "included");
  const omittedCandidates = nodes.filter((node) => node.budgetStatus === "omitted");
  const graphId = buildGraphId({
    rootTarget: input.rootTarget,
    rootPacketId: input.rootPacketId,
    nodes,
    edges,
  });
  const replaySafeSummary = [
    `context-graph ${graphId}`,
    `root=${input.rootTarget}`,
    `nodes=${nodes.length}`,
    `included=${includedCandidates.length}`,
    `omitted=${omittedCandidates.length}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].join("; ");

  return {
    graphId,
    rootTarget: input.rootTarget,
    ...(input.rootPacketId ? { rootPacketId: input.rootPacketId } : {}),
    nodes,
    edges,
    includedCandidates,
    omittedCandidates,
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary,
    evidence: [
      `context-graph:id:${graphId}`,
      `context-graph:root:${input.rootTarget}`,
      `context-graph:nodes:${nodes.length}`,
      `context-graph:included:${includedCandidates.length}`,
      `context-graph:omitted:${omittedCandidates.length}`,
      "context-graph:mutation-authority:not-granted",
      "context-graph:redacted-and-budgeted",
      "context-graph:raw-content-excluded",
    ],
  };
}

function buildNodeId(pathLabel: string, kind: ContextGraphNodeKind, index: number): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${kind}:${pathLabel}:${index}`)
    .digest("hex")
    .slice(0, 10);
  return `ctx-node-${hash}`;
}

function buildGraphId(input: {
  readonly rootTarget: string;
  readonly rootPacketId?: string;
  readonly nodes: readonly ContextGraphNode[];
  readonly edges: readonly ContextGraphEdge[];
}): string {
  const hash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        rootTarget: input.rootTarget,
        rootPacketId: input.rootPacketId,
        nodes: input.nodes.map((node) => [
          node.kind,
          node.pathLabel,
          node.depth,
          node.budgetStatus,
          node.omissionReason,
        ]),
        edges: input.edges.map((edge) => [edge.kind, edge.fromNodeId, edge.toNodeId]),
      }),
    )
    .digest("hex")
    .slice(0, 12);
  return `ctx_graph_${hash}`;
}
