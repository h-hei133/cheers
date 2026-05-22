import crypto from "node:crypto";

export type TaskLifecycleStageKind =
  | "read"
  | "analyze"
  | "plan"
  | "proposal"
  | "review"
  | "edit"
  | "verify"
  | "repair"
  | "complete"
  | "stopped";

export type TaskStageOwnerModule =
  | "agent-loop"
  | "workspace-file-context"
  | "provider-model"
  | "edit-patch"
  | "runtime-verification"
  | "result-surface"
  | "session-continue"
  | "harness-eval";

export type TaskStageReadiness =
  | "ready"
  | "needs-evidence"
  | "review-required"
  | "blocked"
  | "not-applicable"
  | "complete";

export interface TaskStage {
  readonly stageId: string;
  readonly kind: TaskLifecycleStageKind;
  readonly ownerModule: TaskStageOwnerModule;
  readonly inputEvidenceIds: readonly string[];
  readonly outputEvidenceIds: readonly string[];
  readonly preconditions: readonly string[];
  readonly readiness: TaskStageReadiness;
  readonly missingFacts: readonly string[];
  readonly stopReason?: string;
  readonly doNext: string;
  readonly verifierMarker: string;
  readonly redactionStatus: "redacted-and-budgeted" | "not-applicable";
  readonly mutationAuthority: "not-granted";
  readonly replaySafeSummary: string;
}

export function buildTaskStage(input: {
  readonly kind: TaskLifecycleStageKind;
  readonly ownerModule?: TaskStageOwnerModule;
  readonly inputEvidenceIds?: readonly string[];
  readonly outputEvidenceIds?: readonly string[];
  readonly preconditions?: readonly string[];
  readonly readiness: TaskStageReadiness;
  readonly missingFacts?: readonly string[];
  readonly stopReason?: string;
  readonly doNext?: string;
  readonly verifierMarker?: string;
  readonly redactionStatus?: "redacted-and-budgeted" | "not-applicable";
}): TaskStage {
  const ownerModule = input.ownerModule ?? defaultOwner(input.kind);
  const inputEvidenceIds = dedupe(input.inputEvidenceIds ?? []);
  const outputEvidenceIds = dedupe(input.outputEvidenceIds ?? []);
  const missingFacts = dedupe(input.missingFacts ?? []);
  const verifierMarker =
    input.verifierMarker ?? `task-stage:${input.kind}:${input.readiness}`;
  const stageId = `task_stage_${crypto
    .createHash("sha256")
    .update(JSON.stringify({
      kind: input.kind,
      ownerModule,
      inputEvidenceIds,
      outputEvidenceIds,
      readiness: input.readiness,
      missingFacts,
      stopReason: input.stopReason,
      verifierMarker,
    }))
    .digest("hex")
    .slice(0, 12)}`;
  const doNext = input.doNext ?? defaultDoNext(input.kind, input.readiness, missingFacts);
  const replaySafeSummary = [
    `task-stage ${stageId}`,
    `kind=${input.kind}`,
    `owner=${ownerModule}`,
    `readiness=${input.readiness}`,
    `inputs=${inputEvidenceIds.length}`,
    `outputs=${outputEvidenceIds.length}`,
    `missingFacts=${missingFacts.length}`,
    input.stopReason ? `stop=${input.stopReason}` : undefined,
    "mutationAuthority=not-granted",
  ].filter(Boolean).join("; ");

  return {
    stageId,
    kind: input.kind,
    ownerModule,
    inputEvidenceIds,
    outputEvidenceIds,
    preconditions: input.preconditions ?? [],
    readiness: input.readiness,
    missingFacts,
    ...(input.stopReason ? { stopReason: input.stopReason } : {}),
    doNext,
    verifierMarker,
    redactionStatus: input.redactionStatus ?? "redacted-and-budgeted",
    mutationAuthority: "not-granted",
    replaySafeSummary,
  };
}

function defaultOwner(kind: TaskLifecycleStageKind): TaskStageOwnerModule {
  switch (kind) {
    case "read":
      return "workspace-file-context";
    case "analyze":
    case "plan":
      return "agent-loop";
    case "proposal":
      return "provider-model";
    case "review":
    case "edit":
      return "edit-patch";
    case "verify":
      return "runtime-verification";
    case "repair":
      return "edit-patch";
    case "complete":
    case "stopped":
      return "result-surface";
  }
}

function defaultDoNext(
  kind: TaskLifecycleStageKind,
  readiness: TaskStageReadiness,
  missingFacts: readonly string[],
): string {
  if (readiness === "complete") {
    return `Continue after completed ${kind} stage.`;
  }
  if (readiness === "ready") {
    return `Proceed to ${kind} through the existing gated route.`;
  }
  if (readiness === "review-required") {
    return `Review ${kind} evidence before any existing handoff.`;
  }
  return missingFacts[0] ?? `Gather evidence required for ${kind}.`;
}

function dedupe(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => Boolean(value.trim()))));
}
