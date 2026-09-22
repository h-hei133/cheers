import { freezeDeep } from "../../core/values/freeze.js";
import type { LoopContextRebuildInput } from "../../context/rebuildInput.js";
import type { SessionContextRebuildProjection } from "../../context/sessionContextRebuildProjection.js";
import type { ContextWorkingMemory } from "../../context/memory/model.js";
import type { SessionTreeProjection } from "../sessionTreeProjection.js";

export type ContinuationReadinessStatus =
  | "ready"
  | "ready_with_missing_optional_facts"
  | "blocked_missing_required_facts"
  | "blocked_unsafe_context"
  | "blocked_stale_session"
  | "unsupported"
  | "not_ready"
  | "not_proven";

export type ContinuationContextReadinessStatus =
  | "ready_for_review_only_planning"
  | "ready_with_required_refresh"
  | "ready_with_optional_refresh"
  | "blocked_stale_context"
  | "blocked_workspace_mismatch"
  | "blocked_missing_required_facts"
  | "blocked_ambiguous_target"
  | "unsupported";

export interface ContinuationReadinessProjection {
  readonly readinessId: string;
  readonly sourceSessionId: string;
  readonly status: ContinuationReadinessStatus;
  readonly requiredMissingFacts: readonly string[];
  readonly optionalMissingFacts: readonly string[];
  readonly staleFacts: readonly string[];
  readonly unsafeFactsExcluded: readonly string[];
  readonly contextReadinessStatus: ContinuationContextReadinessStatus;
  readonly sourceMemoryIds: readonly string[];
  readonly sourceSessionPathFacts: readonly string[];
  readonly contextRebuildProjectionIds: readonly string[];
  readonly requiredRefreshReads: readonly string[];
  readonly optionalRefreshReads: readonly string[];
  readonly missingRequiredFacts: readonly string[];
  readonly missingOptionalFacts: readonly string[];
  readonly branchGapStatus: "storage_backed" | "branch_unsupported" | "branch_projection_only" | "not_proven";
  readonly compactionGapStatus: "storage_backed" | "compaction_unsupported" | "compaction_projection_only" | "not_proven";
  readonly nextTurnExecuted: false;
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider.env",
  "auth-headers",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "transcript-dumps",
  "unsafe-file-contents",
] as const;

export function evaluateContinuationReadiness(input: {
  readonly sessionProjection: SessionTreeProjection;
  readonly contextRebuildProjection: SessionContextRebuildProjection;
  readonly rebuildInput?: LoopContextRebuildInput;
  readonly requiredFacts?: readonly string[];
  readonly optionalFacts?: readonly string[];
  readonly staleFacts?: readonly string[];
  readonly sourceMemories?: readonly ContextWorkingMemory[];
  readonly sourceSessionPathFacts?: readonly string[];
  readonly ambiguousTarget?: boolean;
  readonly workspaceMismatch?: boolean;
  readonly unsupported?: boolean;
  readonly notProven?: boolean;
}): ContinuationReadinessProjection {
  const requiredMissingFacts = input.requiredFacts?.filter((fact) =>
    input.contextRebuildProjection.missingFacts.includes(fact) ||
    input.rebuildInput?.missingFacts.includes(fact)
  ) ?? [];
  const optionalMissingFacts = input.optionalFacts?.filter((fact) =>
    input.contextRebuildProjection.missingFacts.includes(fact) ||
    input.rebuildInput?.missingFacts.includes(fact)
  ) ?? [];
  const unsafeFactsExcluded = [
    ...input.contextRebuildProjection.excludedUnsafeFacts,
    ...input.sessionProjection.compaction.records.flatMap((record) => record.unsafeInputIds),
    ...input.sessionProjection.compaction.records.flatMap((record) => record.excludedContextFactIds),
    ...(input.rebuildInput?.excludedFactsSummary ?? []),
  ];
  const staleFacts = input.staleFacts ?? input.contextRebuildProjection.staleFacts;
  const requiredBranchFacts = [
    ...input.sessionProjection.branchFacts.missingParentIds.map((id) => `branch-parent-missing:${id}`),
    ...(input.sessionProjection.branchFacts.activeLeafResolution === "missing"
      ? ["active-leaf-missing"]
      : []),
  ];
  const requiredCompactionFacts = [
    ...input.sessionProjection.compaction.records.flatMap((record) => record.missingFactIds),
    ...input.sessionProjection.compaction.records.flatMap((record) => record.unsupportedFactIds),
  ];
  const allRequiredMissingFacts = unique([
    ...requiredMissingFacts,
    ...requiredBranchFacts,
    ...requiredCompactionFacts,
  ]);
  const memoryRequiredRefreshReads = (input.sourceMemories ?? []).flatMap((memory) =>
    memory.reuseEligibility.requiredRefreshSuggestions
  );
  const memoryOptionalRefreshReads = (input.sourceMemories ?? []).flatMap((memory) =>
    memory.reuseEligibility.optionalRefreshSuggestions
  );
  const requiredRefreshReads = unique([
    ...memoryRequiredRefreshReads,
    ...staleFacts.map((fact) => `refresh stale fact: ${fact}`),
    ...allRequiredMissingFacts.map((fact) => `refresh required fact: ${fact}`),
  ]);
  const optionalRefreshReads = unique([
    ...memoryOptionalRefreshReads,
    ...optionalMissingFacts.map((fact) => `refresh optional fact: ${fact}`),
  ]);
  const status = readinessStatus({
    notProven: input.notProven,
    unsupported: input.unsupported,
    redacted:
      input.contextRebuildProjection.redaction.status === "redacted" ||
      input.rebuildInput?.redaction.status === "redacted",
    requiredMissingFacts: allRequiredMissingFacts,
    optionalMissingFacts,
    staleFacts,
    hasTurnMessages: input.sessionProjection.activePathProjection.entryKinds.includes("turn-message"),
  });
  const contextReadinessStatus = continuationContextReadinessStatus({
    ...(input.unsupported !== undefined ? { unsupported: input.unsupported } : {}),
    ...(input.workspaceMismatch !== undefined ? { workspaceMismatch: input.workspaceMismatch } : {}),
    ...(input.ambiguousTarget !== undefined ? { ambiguousTarget: input.ambiguousTarget } : {}),
    staleFacts,
    requiredMissingFacts: allRequiredMissingFacts,
    requiredRefreshReads,
    optionalRefreshReads,
  });

  return freezeDeep({
    readinessId: `continuation-readiness:${input.sessionProjection.sessionIdentity}:${input.sessionProjection.activeLeafId}`,
    sourceSessionId: input.sessionProjection.sessionIdentity,
    status,
    requiredMissingFacts: allRequiredMissingFacts,
    optionalMissingFacts,
    staleFacts,
    unsafeFactsExcluded,
    contextReadinessStatus,
    sourceMemoryIds: (input.sourceMemories ?? []).map((memory) => memory.memoryId),
    sourceSessionPathFacts: input.sourceSessionPathFacts ?? [
      `session=${input.sessionProjection.sessionIdentity}`,
      `activeLeaf=${input.sessionProjection.activeLeafId}`,
    ],
    contextRebuildProjectionIds: [
      `${input.contextRebuildProjection.rebuildSource.sessionIdentity}:context-rebuild:${input.contextRebuildProjection.rebuildSource.activeLeafId}`,
    ],
    requiredRefreshReads,
    optionalRefreshReads,
    missingRequiredFacts: allRequiredMissingFacts,
    missingOptionalFacts: optionalMissingFacts,
    branchGapStatus:
      input.sessionProjection.branchSupport === "storage-backed"
        ? "storage_backed"
        : input.sessionProjection.branchSummary.availability === "observed"
        ? "branch_projection_only"
        : "branch_unsupported",
    compactionGapStatus:
      input.sessionProjection.compaction.availability === "storage-backed"
        ? "storage_backed"
        : input.sessionProjection.compaction.availability === "observed"
        ? "compaction_projection_only"
        : "compaction_unsupported",
    nextTurnExecuted: false,
    redaction: {
      status:
        input.contextRebuildProjection.redaction.status === "redacted" ||
          input.rebuildInput?.redaction.status === "redacted"
          ? "redacted"
          : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: [
      "terminal-success",
      "task-success",
      "provider-success",
      "tool-success",
      "verification-success",
      "repair-success",
      "continuation-ready-is-not-success",
      "context-rebuilt-is-not-success",
      "continuation-ready-is-not-edit-authority",
      "continuation-ready-is-not-apply-authority",
      "continuation-ready-is-not-verification-success",
      ...input.contextRebuildProjection.notProvenClaims,
      ...(input.rebuildInput?.notProvenClaims ?? []),
    ],
    terminalSuccessClaim: false,
  });
}

function readinessStatus(input: {
  readonly notProven?: boolean;
  readonly unsupported?: boolean;
  readonly redacted?: boolean;
  readonly requiredMissingFacts: readonly string[];
  readonly optionalMissingFacts: readonly string[];
  readonly staleFacts: readonly string[];
  readonly hasTurnMessages: boolean;
}): ContinuationReadinessStatus {
  if (input.unsupported) return "unsupported";
  if (input.redacted) return "blocked_unsafe_context";
  if (input.requiredMissingFacts.length > 0) return "blocked_missing_required_facts";
  if (input.staleFacts.length > 0) return "blocked_stale_session";
  if (!input.hasTurnMessages) return "not_ready";
  if (input.notProven) return "not_proven";
  if (input.optionalMissingFacts.length > 0) return "ready_with_missing_optional_facts";
  return "ready";
}

function continuationContextReadinessStatus(input: {
  readonly unsupported?: boolean;
  readonly workspaceMismatch?: boolean;
  readonly ambiguousTarget?: boolean;
  readonly staleFacts: readonly string[];
  readonly requiredMissingFacts: readonly string[];
  readonly requiredRefreshReads: readonly string[];
  readonly optionalRefreshReads: readonly string[];
}): ContinuationContextReadinessStatus {
  if (input.unsupported) return "unsupported";
  if (input.workspaceMismatch) return "blocked_workspace_mismatch";
  if (input.ambiguousTarget) return "blocked_ambiguous_target";
  if (input.staleFacts.length > 0) return "blocked_stale_context";
  if (input.requiredMissingFacts.length > 0) return "blocked_missing_required_facts";
  if (input.requiredRefreshReads.length > 0) return "ready_with_required_refresh";
  if (input.optionalRefreshReads.length > 0) return "ready_with_optional_refresh";
  return "ready_for_review_only_planning";
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
