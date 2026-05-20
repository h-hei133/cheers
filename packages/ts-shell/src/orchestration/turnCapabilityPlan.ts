import type { CodingTaskKind, CodingVerificationSummary } from "./types.js";
import { projectReadOnlyTargetSummary } from "./workspaceTargetProjection.js";

export type TurnCapabilityArea =
  | "read-inspect"
  | "edit-write"
  | "command"
  | "browser"
  | "verification"
  | "provider"
  | "session"
  | "chat";

export type TurnModuleOwner =
  | "agent-loop"
  | "workspace-file-context"
  | "edit-patch"
  | "tool"
  | "runtime"
  | "browser"
  | "provider-model"
  | "session-continue"
  | "result-surface";

export type TurnMutationClassification =
  | "no-write"
  | "mutation-requested"
  | "mutation-completed"
  | "mutation-blocked"
  | "not-applicable";

export interface TurnCapabilityPlanInput {
  readonly taskKind: CodingTaskKind;
  readonly targetPath?: string;
  readonly blockedReason?: string;
  readonly directCommand?: string;
  readonly verification?: CodingVerificationSummary;
  readonly verifyAfterEdit?: boolean;
  readonly inspectFirst?: boolean;
  readonly continuationLineage?: readonly string[];
}

export interface TurnCapabilityPlan {
  readonly turnKind: CodingTaskKind;
  readonly capabilityArea: TurnCapabilityArea;
  readonly selectedModuleOwner: TurnModuleOwner;
  readonly intentConfidence: "explicit" | "inferred" | "fallback";
  readonly targetSummary?: string;
  readonly availabilitySummary: string;
  readonly policySummary: string;
  readonly stoppedBeforeExecutionReason?: string;
  readonly verificationExpectation: "required" | "not-requested" | "skipped";
  readonly continuationLineageSummary: string;
  readonly mutationClassification: TurnMutationClassification;
}

export function projectTurnCapabilityPlan(
  input: TurnCapabilityPlanInput,
): TurnCapabilityPlan {
  const capabilityArea = capabilityAreaForTask(input.taskKind);
  const selectedModuleOwner = ownerForCapabilityArea(capabilityArea);
  const targetSummary = input.targetPath
    ? projectReadOnlyTargetSummary({ targetPath: input.targetPath }).targetLabel
    : undefined;
  const verificationExpectation =
    input.verifyAfterEdit || input.verification?.status === "passed"
      ? "required"
      : input.verification?.status === "skipped" ||
          input.verification?.status === "blocked" ||
          input.verification?.status === "failed"
        ? "skipped"
        : "not-requested";

  return {
    turnKind: input.taskKind,
    capabilityArea,
    selectedModuleOwner,
    intentConfidence: input.directCommand || input.targetPath ? "explicit" : "inferred",
    ...(targetSummary ? { targetSummary } : {}),
    availabilitySummary: "module-owned",
    policySummary: "module-owned",
    ...(input.blockedReason
      ? { stoppedBeforeExecutionReason: input.blockedReason }
      : {}),
    verificationExpectation,
    continuationLineageSummary:
      (input.continuationLineage?.length ?? 0) > 0
        ? "continuation-lineage:present"
        : "continuation-lineage:not-consumed",
    mutationClassification: mutationClassificationForTask(input.taskKind, input),
  };
}

function capabilityAreaForTask(taskKind: CodingTaskKind): TurnCapabilityArea {
  switch (taskKind) {
    case "read-file":
    case "inspect-files":
    case "repo-explain":
      return "read-inspect";
    case "write-file":
    case "edit-file":
      return "edit-write";
    case "run-command":
      return "command";
    case "browser":
      return "browser";
    case "chat":
      return "chat";
  }
}

function ownerForCapabilityArea(area: TurnCapabilityArea): TurnModuleOwner {
  switch (area) {
    case "read-inspect":
      return "workspace-file-context";
    case "edit-write":
      return "edit-patch";
    case "command":
      return "tool";
    case "browser":
      return "browser";
    case "provider":
      return "provider-model";
    case "session":
      return "session-continue";
    case "verification":
      return "result-surface";
    case "chat":
      return "agent-loop";
  }
}

function mutationClassificationForTask(
  taskKind: CodingTaskKind,
  input: TurnCapabilityPlanInput,
): TurnMutationClassification {
  if (input.blockedReason) {
    return "mutation-blocked";
  }
  switch (taskKind) {
    case "write-file":
    case "edit-file":
      return "mutation-requested";
    case "read-file":
    case "inspect-files":
    case "repo-explain":
    case "browser":
    case "run-command":
      return "no-write";
    case "chat":
      return "not-applicable";
  }
}
