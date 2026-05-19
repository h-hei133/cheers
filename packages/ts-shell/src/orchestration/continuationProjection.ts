import type { LineageActivationDecision } from "./continuationLineage.js";

export interface ContinuationProjection {
  readonly summary: string;
  readonly evidence: readonly string[];
}

const unsafeProjectionTextPattern =
  /(raw-dom|raw DOM|<html|<\/|authorization|api[_-]?key|token|secret|cookie|private-agents-real|BEGIN [A-Z ]*PRIVATE KEY)/i;

export function projectLineageActivation(
  decision: LineageActivationDecision,
): ContinuationProjection {
  if (decision.status === "activated") {
    return {
      summary: `continuation lineage activated: ${decision.activationKind ?? "unknown"}`,
      evidence: decision.evidence,
    };
  }
  if (decision.status === "blocked") {
    return {
      summary:
        decision.reason ??
        "Continuation lineage is ambiguous; provide explicit target/action.",
      evidence: decision.evidence,
    };
  }
  return {
    summary: "continuation lineage not consumed",
    evidence: [],
  };
}

export function projectReplaySafeContinuationSummary(input: {
  readonly targetFiles: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly verificationCommand?: string;
  readonly ambiguityReason?: string;
}): ContinuationProjection {
  const safeTargetFiles = input.targetFiles.filter(isSafeProjectionText);
  const safeEvidenceIds = input.evidenceIds.filter(isSafeProjectionText);
  const safeVerificationCommand = input.verificationCommand
    ? isSafeProjectionText(input.verificationCommand)
      ? input.verificationCommand
      : undefined
    : undefined;
  const safeAmbiguityReason = input.ambiguityReason
    ? isSafeProjectionText(input.ambiguityReason)
      ? input.ambiguityReason
      : "Continuation lineage is ambiguous; provide explicit target/action."
    : undefined;
  const evidence = [
    ...safeTargetFiles.map((target) => `continuation-target:${target}`),
    ...safeEvidenceIds.map((id) => `continuation-evidence:${id}`),
    ...(safeVerificationCommand
      ? [`continuation-verification-command:${safeVerificationCommand}`]
      : []),
    ...(safeAmbiguityReason
      ? [`continuation-ambiguity:${safeAmbiguityReason}`]
      : []),
  ];
  return {
    summary:
      safeAmbiguityReason ??
      (safeTargetFiles[0]
        ? `Continuation can reuse replay-safe evidence for ${safeTargetFiles[0]}.`
        : "Continuation has replay-safe evidence but no concrete target."),
    evidence,
  };
}

function isSafeProjectionText(value: string): boolean {
  return value.trim().length > 0 && !unsafeProjectionTextPattern.test(value);
}
