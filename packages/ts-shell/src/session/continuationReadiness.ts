import type { LoopContextRebuildInput } from "../context/rebuildInput.js";
import type { SessionContextRebuildProjection } from "../context/sessionContextRebuildProjection.js";
import type { SessionTreeProjection } from "./sessionTreeProjection.js";

export type ContinuationReadinessStatus =
  | "ready"
  | "ready_with_missing_optional_facts"
  | "blocked_missing_required_facts"
  | "blocked_unsafe_context"
  | "blocked_stale_session"
  | "unsupported"
  | "not_ready"
  | "not_proven";

export interface ContinuationReadinessProjection {
  readonly readinessId: string;
  readonly sourceSessionId: string;
  readonly status: ContinuationReadinessStatus;
  readonly requiredMissingFacts: readonly string[];
  readonly optionalMissingFacts: readonly string[];
  readonly staleFacts: readonly string[];
  readonly unsafeFactsExcluded: readonly string[];
  readonly branchGapStatus: "branch_unsupported" | "branch_projection_only" | "not_proven";
  readonly compactionGapStatus: "compaction_unsupported" | "compaction_projection_only" | "not_proven";
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
    ...(input.rebuildInput?.excludedFactsSummary ?? []),
  ];
  const status = readinessStatus({
    notProven: input.notProven,
    unsupported: input.unsupported,
    redacted:
      input.contextRebuildProjection.redaction.status === "redacted" ||
      input.rebuildInput?.redaction.status === "redacted",
    requiredMissingFacts,
    optionalMissingFacts,
    staleFacts: input.staleFacts ?? input.contextRebuildProjection.staleFacts,
    hasTurnMessages: input.sessionProjection.activePathProjection.entryKinds.includes("turn-message"),
  });

  return deepFreeze({
    readinessId: `continuation-readiness:${input.sessionProjection.sessionIdentity}:${input.sessionProjection.activeLeafId}`,
    sourceSessionId: input.sessionProjection.sessionIdentity,
    status,
    requiredMissingFacts,
    optionalMissingFacts,
    staleFacts: input.staleFacts ?? input.contextRebuildProjection.staleFacts,
    unsafeFactsExcluded,
    branchGapStatus:
      input.sessionProjection.branchSummary.availability === "observed"
        ? "branch_projection_only"
        : "branch_unsupported",
    compactionGapStatus:
      input.sessionProjection.compaction.availability === "observed"
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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
