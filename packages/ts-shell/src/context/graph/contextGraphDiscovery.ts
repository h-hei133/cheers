import path from "node:path";

import {
  buildContextGraph,
  type ContextGraph,
  type ContextGraphEdgeKind,
  type ContextGraphNode,
  type ContextGraphNodeKind,
  type ContextGraphSourceKind,
} from "./contextGraph.js";
import {
  createContextGraphBudgetState,
  decideContextGraphNode,
  mapContextGraphOmissionReason,
  type ContextGraphBudgetLimits,
} from "./contextGraphBudget.js";
import {
  buildTargetedContextPacket,
  type ContextPacketSourceSummary,
  type TargetedContextPacket,
} from "./contextPacket.js";

interface PendingNode {
  readonly kind: ContextGraphNodeKind;
  readonly pathLabel: string;
  readonly relation: string;
  readonly sourceKind: ContextGraphSourceKind;
  readonly depth: ContextGraphNode["depth"];
  readonly reason: string;
  readonly byteLength: number;
  readonly confidence: ContextGraphNode["confidence"];
  readonly summary?: string;
  readonly sourceOmissionReason?: string;
}

export async function discoverContextGraph(input: {
  readonly workspaceRoot: string;
  readonly targetPath: string;
  readonly packet?: TargetedContextPacket;
  readonly limits?: Partial<ContextGraphBudgetLimits>;
}): Promise<ContextGraph> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const packet =
    input.packet ??
    (await buildTargetedContextPacket({
      workspaceRoot,
      targetPath: input.targetPath,
      limits: {
        maxFilesRead: input.limits?.maxFilesRead,
        maxBytesPerFile: input.limits?.maxBytesPerFile,
        maxTotalBytes: input.limits?.maxTotalBytes,
        maxCandidateCount: Math.max(input.limits?.maxGraphNodes ?? 18, 24),
      },
    }));
  let state = createContextGraphBudgetState(input.limits);
  const pending: PendingNode[] = [
    {
      kind: "root-target",
      pathLabel: packet.targetSafeLabel,
      relation: "explicit target",
      sourceKind: "target-packet",
      depth: 0,
      reason: "explicit target file",
      byteLength: packet.selectedCandidateSummaries.find((source) => source.kind === "target-file-summary")?.byteLength ?? 0,
      confidence: "high",
      summary: packet.selectedCandidateSummaries.find((source) => source.kind === "target-file-summary")?.summary,
    },
    ...exportSymbolNodes(packet),
    ...packet.contextSources
      .filter((source) => source.kind !== "target-file-summary")
      .map(sourceToPendingNode),
    ...(await secondHopNodes({ workspaceRoot, packet, limits: input.limits })),
  ];

  const nodes: Omit<ContextGraphNode, "nodeId">[] = [];
  for (const item of pending) {
    const decision = decideContextGraphNode({
      state,
      pathLabel: item.pathLabel,
      kind: item.kind,
      depth: item.depth,
      byteLength: item.byteLength,
      sourceOmissionReason: mapContextGraphOmissionReason(item.sourceOmissionReason),
    });
    state = decision.state;
    nodes.push({
      kind: decision.status === "included" ? item.kind : "omitted-candidate",
      pathLabel: item.pathLabel,
      relation: item.relation,
      sourceKind: item.sourceKind,
      depth: item.depth,
      reason: decision.omissionReason ?? item.reason,
      budgetStatus: decision.status,
      confidence: decision.omissionReason ? "low" : item.confidence,
      redactionStatus: "redacted-and-budgeted",
      ...(item.summary && decision.status === "included" ? { summary: item.summary } : {}),
      ...(decision.omissionReason ? { omissionReason: decision.omissionReason } : {}),
    });
  }

  const edges = buildEdges(packet.targetSafeLabel, nodes);
  const graph = buildContextGraph({
    rootTarget: packet.targetSafeLabel,
    rootPacketId: packet.packetId,
    nodes,
    edges,
  });
  return {
    ...graph,
    evidence: [
      ...packet.evidence,
      ...graph.evidence,
      "context-graph-discovery:deterministic",
      "context-graph-discovery:depth-max:2",
      "context-graph-discovery:no-mutation",
      "context-graph-discovery:no-provider-call",
      "context-graph-discovery:no-command-execution",
    ],
  };
}

function sourceToPendingNode(source: ContextPacketSourceSummary): PendingNode {
  const kind = mapContextSourceKind(source.kind);
  return {
    kind,
    pathLabel: source.pathLabel,
    relation: source.relation,
    sourceKind: mapGraphSourceKind(kind),
    depth: 1,
    reason: source.status === "included" ? source.relation : (source.reason ?? source.relation),
    byteLength: source.byteLength,
    confidence: source.status === "included" ? confidenceForKind(kind) : "low",
    ...(source.summary ? { summary: source.summary } : {}),
    ...(source.status === "omitted" ? { sourceOmissionReason: source.reason ?? source.kind } : {}),
  };
}

function exportSymbolNodes(packet: TargetedContextPacket): PendingNode[] {
  const target = packet.selectedCandidateSummaries.find(
    (source) => source.kind === "target-file-summary",
  );
  const summary = target?.summary;
  if (!summary || /symbols=\(none\)/.test(summary)) {
    return [];
  }
  const symbolText = summary.match(/symbols=([^ ]+)/)?.[1];
  if (!symbolText) {
    return [];
  }
  return [
    {
      kind: "direct-export",
      pathLabel: `${packet.targetSafeLabel}#${symbolText}`,
      relation: "exported symbol hints",
      sourceKind: "export-symbol-scan",
      depth: 0,
      reason: "exported symbols provide call-site search hints",
      byteLength: 0,
      confidence: "medium",
      summary: `symbols=${symbolText}`,
    },
  ];
}

async function secondHopNodes(input: {
  readonly workspaceRoot: string;
  readonly packet: TargetedContextPacket;
  readonly limits?: Partial<ContextGraphBudgetLimits>;
}): Promise<PendingNode[]> {
  const imports = input.packet.selectedCandidateSummaries.filter(
    (source) => source.kind === "direct-import",
  );
  const nodes: PendingNode[] = [];
  for (const importSource of imports.slice(0, input.limits?.maxSecondHopCandidates ?? 4)) {
    const secondPacket = await buildTargetedContextPacket({
      workspaceRoot: input.workspaceRoot,
      targetPath: importSource.pathLabel,
      limits: {
        maxCandidateCount: 8,
        maxFilesRead: 4,
        maxBytesPerFile: input.limits?.maxBytesPerFile,
        maxTotalBytes: input.limits?.maxTotalBytes,
      },
    });
    for (const source of secondPacket.selectedCandidateSummaries) {
      if (source.kind !== "direct-import" || source.pathLabel === input.packet.targetSafeLabel) {
        continue;
      }
      nodes.push({
        kind: "second-hop-candidate",
        pathLabel: source.pathLabel,
        relation: `second-hop from ${importSource.pathLabel}`,
        sourceKind: "second-hop-scan",
        depth: 2,
        reason: "direct import of a direct import",
        byteLength: source.byteLength,
        confidence: "medium",
        ...(source.summary ? { summary: source.summary } : {}),
      });
    }
  }
  return nodes;
}

function buildEdges(
  rootTarget: string,
  nodes: readonly Omit<ContextGraphNode, "nodeId">[],
): readonly { readonly fromPathLabel: string; readonly toPathLabel: string; readonly kind: ContextGraphEdgeKind; readonly reason: string }[] {
  return nodes
    .filter((node) => node.budgetStatus === "included" && node.pathLabel !== rootTarget)
    .map((node) => ({
      fromPathLabel: node.kind === "second-hop-candidate" ? rootTarget : rootTarget,
      toPathLabel: node.pathLabel,
      kind: edgeKindForNode(node.kind),
      reason: node.reason,
    }));
}

function mapContextSourceKind(kind: ContextPacketSourceSummary["kind"]): ContextGraphNodeKind {
  switch (kind) {
    case "direct-import":
      return "direct-import";
    case "sibling-file":
      return "sibling-file";
    case "nearby-test":
      return "nearby-test";
    case "docs-readme-reference":
      return "docs-readme";
    case "call-site-candidate":
      return "reverse-call-site";
    case "omitted-over-budget-candidate":
    case "unavailable-source":
    case "target-file-summary":
      return "omitted-candidate";
  }
}

function mapGraphSourceKind(kind: ContextGraphNodeKind): ContextGraphSourceKind {
  switch (kind) {
    case "direct-import":
      return "import-scan";
    case "direct-export":
      return "export-symbol-scan";
    case "sibling-file":
      return "sibling-scan";
    case "nearby-test":
      return "test-convention";
    case "docs-readme":
      return "docs-scan";
    case "reverse-call-site":
      return "text-reference-scan";
    case "second-hop-candidate":
      return "second-hop-scan";
    case "root-target":
    case "omitted-candidate":
      return "target-packet";
  }
}

function edgeKindForNode(kind: ContextGraphNodeKind): ContextGraphEdgeKind {
  switch (kind) {
    case "direct-import":
    case "second-hop-candidate":
      return "imports";
    case "direct-export":
      return "exports-symbol";
    case "nearby-test":
      return "tests";
    case "docs-readme":
      return "documents";
    case "reverse-call-site":
      return "calls-or-references";
    case "sibling-file":
    case "root-target":
    case "omitted-candidate":
      return "heuristic-related";
  }
}

function confidenceForKind(kind: ContextGraphNodeKind): ContextGraphNode["confidence"] {
  switch (kind) {
    case "root-target":
    case "direct-import":
    case "nearby-test":
      return "high";
    case "direct-export":
    case "second-hop-candidate":
    case "reverse-call-site":
      return "medium";
    default:
      return "low";
  }
}
