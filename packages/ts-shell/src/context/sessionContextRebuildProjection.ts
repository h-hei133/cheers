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
  readonly availableContext: readonly string[];
  readonly missingRequiredFacts: readonly string[];
  readonly missingOptionalFacts: readonly string[];
  readonly excludedUnsafeFacts: readonly string[];
  readonly staleFacts: readonly string[];
  readonly unsupportedBranchFacts: readonly string[];
  readonly unsupportedCompactionFacts: readonly string[];
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
  readonly requiredFacts?: readonly string[];
  readonly optionalFacts?: readonly string[];
  readonly staleFacts?: readonly string[];
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
  const unsupportedBranchFacts = [
    ...(input.sessionProjection.branchSupport === "not-proven"
      ? ["storage-backed-branch-navigation"]
      : []),
    ...(input.sessionProjection.branchSummary.availability === "not-supported-by-current-schema"
      ? ["branch-summary-not-supported-by-current-schema"]
      : []),
  ];
  const unsupportedCompactionFacts = [
    ...(input.sessionProjection.compaction.records.length === 0
      ? ["storage-backed-compaction-record"]
      : []),
  ];
  const excludedUnsafeFacts = [
    "raw-transcript-content",
    "tool-execution-details",
    "resource-details",
    "raw-provider-output",
    "raw-edit-content",
    "unredacted-command-output",
  ];
  const missingFacts = [
    ...unsupportedBranchFacts,
    ...unsupportedCompactionFacts,
    ...(input.sessionProjection.branchSummary.records.length === 0
      ? ["branch-summary-record"]
      : []),
    ...excludedUnsafeFacts,
    ...(input.requiredFacts ?? []),
    ...(input.optionalFacts ?? []),
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
    availableContext: [
      `active-path:${activePathEntriesConsidered.length}`,
      `branch-summaries:${branchSummariesConsidered.length}`,
      `compactions:${compactionSummariesConsidered.length}`,
    ],
    missingRequiredFacts: input.requiredFacts ?? [],
    missingOptionalFacts: input.optionalFacts ?? [
      ...unsupportedBranchFacts,
      ...unsupportedCompactionFacts,
      "branch-summary-record",
    ],
    excludedUnsafeFacts,
    staleFacts: input.staleFacts ?? [],
    unsupportedBranchFacts,
    unsupportedCompactionFacts,
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
      "context-rebuilt-is-not-success",
      "context-completeness",
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
