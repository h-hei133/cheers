import type { ContinuityStateLike } from "./runtimeHandoffProjection.js";

export type ContinuationIntentKind =
  | "explicit-continue"
  | "weak-follow-up"
  | "next-step"
  | "reopen-previous-target"
  | "rebase-request"
  | "retry-after-failure"
  | "unrelated-new-task";

export interface ContinuationIntentClassification {
  readonly kind: ContinuationIntentKind;
  readonly confidence: "high" | "medium" | "low";
  readonly reason: string;
}

export function classifyContinuationIntent(input: {
  readonly prompt: string;
  readonly continuity?: ContinuityStateLike;
}): ContinuationIntentClassification {
  const prompt = input.prompt.trim();
  const normalized = prompt.toLowerCase();
  const continuity = input.continuity ?? {};
  const hasLineage =
    (continuity.recentTargetFiles?.length ?? 0) > 0 ||
    (continuity.recentChangedFiles?.length ?? 0) > 0 ||
    (continuity.recentFailedFiles?.length ?? 0) > 0 ||
    (continuity.lastContinuationEvidence?.length ?? 0) > 0 ||
    Boolean(continuity.lastFailure) ||
    Boolean(continuity.lastVerificationStatus);

  if (/^\/continue\b/i.test(prompt)) {
    return {
      kind: "explicit-continue",
      confidence: "high",
      reason: "explicit slash continuation",
    };
  }
  if (
    /\b(?:why did it stop|continue fixing|continue repair|刚才为什么停了|继续修)\b/i.test(
      prompt,
    )
  ) {
    return {
      kind: "retry-after-failure",
      confidence: hasLineage ? "high" : "medium",
      reason: "failure continuation cue",
    };
  }
  if (/\b(?:migrat|moved|rebased|new root|legacy root|迁移|换了目录)\b/i.test(prompt)) {
    return {
      kind: "rebase-request",
      confidence: hasLineage ? "high" : "medium",
      reason: "path/root rebase cue",
    };
  }
  if (
    /\b(?:reopen|previous file|same file|that file|之前的文件|刚才那个文件)\b/i.test(
      prompt,
    )
  ) {
    return {
      kind: "reopen-previous-target",
      confidence: hasLineage ? "high" : "medium",
      reason: "previous target cue",
    };
  }
  if (isTemporalSuccessorPrompt(prompt)) {
    return {
      kind: "next-step",
      confidence: hasLineage ? "high" : "low",
      reason: "temporal successor cue",
    };
  }
  if (isWeakFollowUpPrompt(prompt)) {
    return {
      kind: "weak-follow-up",
      confidence: hasLineage ? "medium" : "low",
      reason: "weak follow-up cue",
    };
  }
  return {
    kind: "unrelated-new-task",
    confidence: "high",
    reason: "no continuation cue",
  };
}

function isWeakFollowUpPrompt(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized || normalized.length > 80) {
    return false;
  }
  return /^(?:continue|keep going|go on|do it|finish it|proceed|carry on|what next|what's next|next|after that|继续|接着|继续吧|做吧)$/i.test(
    normalized,
  );
}

function isTemporalSuccessorPrompt(prompt: string): boolean {
  const firstLine =
    prompt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  const normalized = firstLine
    .toLowerCase()
    .replace(/[!?。！？]+$/g, "")
    .trim();
  return /^(?:next|what next|what's next|whats next|then|after that|and then)$/.test(
    normalized,
  );
}
