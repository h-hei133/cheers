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
    readonly retainedContextFactIds: readonly string[];
    readonly excludedContextFactIds: readonly string[];
    readonly staleInputIds: readonly string[];
    readonly unsafeInputIds: readonly string[];
    readonly missingFactIds: readonly string[];
    readonly unsupportedFactIds: readonly string[];
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
      retainedContextFactIds: record.retainedContextFactIds,
      excludedContextFactIds: record.excludedContextFactIds,
      staleInputIds: record.staleInputIds,
      unsafeInputIds: record.unsafeInputIds,
      missingFactIds: record.missingFactIds,
      unsupportedFactIds: record.unsupportedFactIds,
    }));
  const branchSummariesConsidered =
    input.sessionProjection.branchSummary.records.map((record) => ({
      branchSummaryId: record.branchSummaryId,
      summaryAvailability: record.summaryAvailability,
    }));
  const unsupportedBranchFacts = [
    ...(input.sessionProjection.branchSupport !== "storage-backed"
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
    ...(input.sessionProjection.branchSummary.records.length === 0 &&
        input.sessionProjection.branchSupport !== "storage-backed"
      ? ["branch-summary-record"]
      : []),
    ...input.sessionProjection.branchFacts.missingParentIds.map((id) => `branch-parent-missing:${id}`),
    ...(input.sessionProjection.branchFacts.activeLeafResolution === "missing"
      ? ["active-leaf-missing"]
      : []),
    ...compactionSummariesConsidered.flatMap((record) => record.missingFactIds),
    ...excludedUnsafeFacts,
    ...compactionSummariesConsidered.flatMap((record) => record.unsafeInputIds),
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
      `retained-context:${compactionSummariesConsidered.flatMap((record) => record.retainedContextFactIds).length}`,
      `excluded-context:${compactionSummariesConsidered.flatMap((record) => record.excludedContextFactIds).length}`,
    ],
    missingRequiredFacts: input.requiredFacts ?? [],
    missingOptionalFacts: input.optionalFacts ?? [
      ...unsupportedBranchFacts,
      ...unsupportedCompactionFacts,
      ...(input.sessionProjection.branchSupport === "storage-backed"
        ? []
        : ["branch-summary-record"]),
    ],
    excludedUnsafeFacts,
    staleFacts: [
      ...(input.staleFacts ?? []),
      ...compactionSummariesConsidered.flatMap((record) => record.staleInputIds),
    ],
    unsupportedBranchFacts,
    unsupportedCompactionFacts: [
      ...unsupportedCompactionFacts,
      ...compactionSummariesConsidered.flatMap((record) => record.unsupportedFactIds),
    ],
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
      "active-leaf-selected-is-not-success",
      "compaction-summary-truth",
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
