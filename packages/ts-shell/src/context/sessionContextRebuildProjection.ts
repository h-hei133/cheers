import type { SessionTreeProjection } from "../session/sessionTreeProjection.js";

export interface SessionContextRebuildProjection {
  readonly rebuildSource: {
    readonly sessionIdentity: string;
    readonly activeLeafId: string;
    readonly treeSupport: SessionTreeProjection["treeSupport"];
    readonly branchSupport: SessionTreeProjection["branchSupport"];
  };
  readonly activePathEntriesConsidered: readonly {
    readonly id: string;
    readonly kind: string;
    readonly payloadSummary: "metadata-only";
  }[];
  readonly compactionSummariesConsidered: readonly {
    readonly compactionId: string;
    readonly summaryAvailability: "available" | "missing" | "not-proven";
    readonly evidence: "observed" | "planned" | "not-proven";
  }[];
  readonly branchSummariesConsidered: readonly {
    readonly branchSummaryId: string;
    readonly summaryAvailability: "available" | "missing" | "not-proven";
  }[];
  readonly policy: {
    readonly resourceDetails: "excluded";
    readonly toolDetails: "excluded";
    readonly rawTranscript: "excluded";
  };
  readonly missingFacts: readonly string[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function projectSessionContextRebuild(input: {
  readonly sessionProjection: SessionTreeProjection;
}): SessionContextRebuildProjection {
  const activePathSet = new Set(input.sessionProjection.activePath);
  const activePathEntriesConsidered = input.sessionProjection.nodes
    .filter((node) => activePathSet.has(node.id))
    .map((node) => ({
      id: node.id,
      kind: node.kind,
      payloadSummary: node.payloadSummary,
    }));
  const compactionSummariesConsidered =
    input.sessionProjection.compaction.records.map((record) => ({
      compactionId: record.compactionId,
      summaryAvailability: record.summaryAvailability,
      evidence: record.evidence,
    }));
  const branchSummariesConsidered =
    input.sessionProjection.branchSummary.records.map((record) => ({
      branchSummaryId: record.branchSummaryId,
      summaryAvailability: record.summaryAvailability,
    }));
  const missingFacts = [
    ...(input.sessionProjection.branchSupport === "not-proven"
      ? ["storage-backed-branch-navigation"]
      : []),
    ...(input.sessionProjection.compaction.records.length === 0
      ? ["compaction-record"]
      : []),
    ...(input.sessionProjection.branchSummary.records.length === 0
      ? ["branch-summary-record"]
      : []),
    "raw-transcript-content",
    "tool-execution-details",
    "resource-details",
  ];
  const redacted =
    input.sessionProjection.compaction.records.some(
      (record) => record.redaction.status === "redacted",
    ) ||
    input.sessionProjection.branchSummary.records.some(
      (record) => record.redaction.status === "redacted",
    );

  return deepFreeze({
    rebuildSource: {
      sessionIdentity: input.sessionProjection.sessionIdentity,
      activeLeafId: input.sessionProjection.activeLeafId,
      treeSupport: input.sessionProjection.treeSupport,
      branchSupport: input.sessionProjection.branchSupport,
    },
    activePathEntriesConsidered,
    compactionSummariesConsidered,
    branchSummariesConsidered,
    policy: {
      resourceDetails: "excluded",
      toolDetails: "excluded",
      rawTranscript: "excluded",
    },
    missingFacts,
    redaction: {
      status: redacted ? "redacted" : "report-safe",
      excluded: input.sessionProjection.redaction.excluded,
    },
    terminalSuccessClaim: false,
    notProvenClaims: [
      "terminal-success",
      "context-rebuild-execution",
      "storage-backed-branch-navigation",
    ],
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
