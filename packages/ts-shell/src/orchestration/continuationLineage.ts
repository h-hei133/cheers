import type { ContinuityStateLike } from "./runtimeHandoffProjection.js";

export interface ContinuationVerificationHint {
  readonly status?: string;
  readonly command?: string;
  readonly reason?: string;
  readonly blockerKind?: string;
  readonly nextAction?: string;
}

export interface ReplaySafeContinuationLineage {
  readonly previousTaskSummary?: string;
  readonly targetFiles: readonly string[];
  readonly capabilityArea?: string;
  readonly previousResultStatus?: string;
  readonly evidenceIds: readonly string[];
  readonly verificationHint?: ContinuationVerificationHint;
  readonly safeNextActionHint?: string;
  readonly ambiguityReason?: string;
}

export interface ContinuationSlot {
  readonly path: string;
  readonly kind: "edit" | "read" | "verify" | "unknown";
  readonly payload: string;
  readonly active: boolean;
}

export interface LineageActivationDecision {
  readonly status: "activated" | "blocked" | "not-applicable";
  readonly activationKind?: "same-file-slot" | "cross-file-candidate";
  readonly confidence?: "high" | "medium" | "low";
  readonly reason?: string;
  readonly evidence: readonly string[];
}

const unsafeEvidencePattern =
  /(raw-dom|raw DOM|<html|<\/|authorization|api[_-]?key|token|secret|cookie|private-agents-real|BEGIN [A-Z ]*PRIVATE KEY)/i;

export function buildReplaySafeContinuationLineage(input: {
  readonly continuity: ContinuityStateLike;
}): ReplaySafeContinuationLineage {
  const continuity = input.continuity;
  const targetFiles = uniqueNormalized([
    ...(continuity.recentTargetFiles ?? []),
    ...(continuity.recentChangedFiles ?? []),
    ...(continuity.recentVerifiedFiles ?? []),
    ...(continuity.recentFailedFiles ?? []).map((entry) => entry.path),
    ...(continuity.lastActionResultSeed?.target
      ? [continuity.lastActionResultSeed.target]
      : []),
  ]);
  const evidenceIds = (continuity.lastContinuationEvidence ?? [])
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !unsafeEvidencePattern.test(entry))
    .slice(0, 12);
  const verificationHint = projectVerificationHint(continuity, evidenceIds);
  const previousResultStatus =
    continuity.lastTerminalClassification ??
    continuity.lastContinuationStatus ??
    continuity.lastVerificationStatus;
  const ambiguityReason =
    targetFiles.length > 1
      ? `multiple target files: ${targetFiles.join(", ")}`
      : undefined;

  return {
    ...(continuity.lastUserIntent
      ? { previousTaskSummary: truncate(continuity.lastUserIntent, 180) }
      : {}),
    targetFiles,
    ...(continuity.lastTaskKind ? { capabilityArea: continuity.lastTaskKind } : {}),
    ...(previousResultStatus ? { previousResultStatus } : {}),
    evidenceIds,
    ...(verificationHint ? { verificationHint } : {}),
    ...(continuity.lastVerificationNextAction
      ? { safeNextActionHint: truncate(continuity.lastVerificationNextAction, 180) }
      : {}),
    ...(ambiguityReason ? { ambiguityReason } : {}),
  };
}

export function parseContinuationSlots(
  continuity: ContinuityStateLike,
): readonly ContinuationSlot[] {
  const slots: ContinuationSlot[] = [];
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const match = entry
      .trim()
      .match(
        /^continuation-lineage-(active|slot):([^:]+)::([^:]+)::(.+)$/i,
      );
    if (!match) {
      continue;
    }
    const kind = normalizeSlotKind(match[3] ?? "");
    slots.push({
      path: normalizePathLike(match[2] ?? ""),
      kind,
      payload: (match[4] ?? "").trim(),
      active: (match[1] ?? "").toLowerCase() === "active",
    });
  }
  return slots.filter((slot) => slot.path.length > 0);
}

export function decideLineageActivation(input: {
  readonly continuity: ContinuityStateLike;
  readonly weakOrTemporalCue: boolean;
  readonly selectedReopenTarget?: string;
  readonly reopenCandidates?: readonly string[];
  readonly crossFileSignal?: boolean;
}): LineageActivationDecision {
  if (!input.weakOrTemporalCue) {
    return { status: "not-applicable", evidence: [] };
  }

  const slots = parseContinuationSlots(input.continuity);
  const activeSlots = slots.filter((slot) => slot.active);
  const distinctSlots = uniqueSlotIdentities(slots);
  if (activeSlots.length > 0) {
    if (distinctSlots.length > 1) {
      return {
        status: "blocked",
        activationKind: "same-file-slot",
        confidence: "low",
        reason:
          "Continuation follow-up is ambiguous across multiple subtask slots. Provide an explicit target/action to continue.",
        evidence: [
          "continuation-lineage-activation-clarify:same-file-slot",
          "continuation-lineage-slot-confidence:low",
        ],
      };
    }
    const active = activeSlots[0];
    if (active?.kind === "edit" && /=>/.test(active.payload)) {
      return {
        status: "activated",
        activationKind: "same-file-slot",
        confidence: "high",
        evidence: [
          "continuation-lineage-activation:same-file-slot",
          "continuation-lineage-activation-mode:weak-shape",
          "continuation-lineage-slot-confidence:high",
        ],
      };
    }
  }

  const candidates = uniqueNormalized(input.reopenCandidates ?? []);
  if (input.crossFileSignal || candidates.length > 0) {
    if (input.selectedReopenTarget && candidates.length === 1) {
      return {
        status: "activated",
        activationKind: "cross-file-candidate",
        confidence: "high",
        evidence: [
          "continuation-lineage-activation:cross-file-candidate",
          "continuation-lineage-activation-mode:weak-shape",
          "continuation-lineage-slot-confidence:high",
        ],
      };
    }
    if (candidates.length > 1) {
      return {
        status: "blocked",
        activationKind: "cross-file-candidate",
        confidence: "low",
        reason:
          "Continuation follow-up has multiple candidate targets. Provide an explicit file path or transform to continue.",
        evidence: [
          "continuation-lineage-activation-clarify:cross-file-candidate",
          "continuation-lineage-slot-confidence:low",
        ],
      };
    }
  }

  return { status: "not-applicable", evidence: [] };
}

function projectVerificationHint(
  continuity: ContinuityStateLike,
  evidenceIds: readonly string[],
): ContinuationVerificationHint | undefined {
  let command = continuity.lastVerificationCommand;
  let nextAction = continuity.lastVerificationNextAction;
  let blockerKind = continuity.lastVerificationBlockerKind;
  for (const entry of evidenceIds) {
    command ??= entry.match(/^verify-command-hint:(.+)$/i)?.[1]?.trim();
    nextAction ??= entry.match(/^verify-next-action:(.+)$/i)?.[1]?.trim();
    blockerKind ??= entry.match(/^verify-blocker-kind:(.+)$/i)?.[1]?.trim();
  }
  if (
    !continuity.lastVerificationStatus &&
    !command &&
    !continuity.lastVerificationReason &&
    !blockerKind &&
    !nextAction
  ) {
    return undefined;
  }
  return {
    ...(continuity.lastVerificationStatus
      ? { status: continuity.lastVerificationStatus }
      : {}),
    ...(command ? { command } : {}),
    ...(continuity.lastVerificationReason
      ? { reason: continuity.lastVerificationReason }
      : {}),
    ...(blockerKind ? { blockerKind } : {}),
    ...(nextAction ? { nextAction } : {}),
  };
}

function uniqueSlotIdentities(slots: readonly ContinuationSlot[]): string[] {
  return Array.from(
    new Set(slots.map((slot) => `${slot.path}::${slot.kind}::${slot.payload}`)),
  );
}

function normalizeSlotKind(value: string): ContinuationSlot["kind"] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "edit" || normalized === "read" || normalized === "verify") {
    return normalized;
  }
  return "unknown";
}

function uniqueNormalized(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values
        .map(normalizePathLike)
        .filter(
          (value) =>
            value.length > 0 &&
            value !== "(unknown)" &&
            !unsafeEvidencePattern.test(value),
        ),
    ),
  );
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength)}...`;
}
