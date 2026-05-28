import type {
  GroundedRepairInstruction,
  WorkflowTaskPlan,
} from "../orchestration/workflowTaskPlanner.js";
import type { GroundedDeliverableMode } from "../orchestration/runtimeHandoffProjection.js";
import { shouldBuildContextPlanningSurface } from "./contextPlanningIntent.js";

export interface ReadWindowPlanInput {
  readonly lineCount?: number;
  readonly lineOffset?: number;
}

export interface ReadFragmentPlanInput {
  readonly lineIndexes?: readonly number[];
  readonly ranges?: readonly string[];
  readonly sourceWindowStart?: number;
  readonly sourceWindowEnd?: number;
  readonly fingerprint?: string;
  readonly filter?: "none" | "function-definitions";
}

export function buildReadWindowPlanFields(
  input: ReadWindowPlanInput,
): Pick<WorkflowTaskPlan, "readLineCount" | "readLineOffset"> {
  return {
    ...(input.lineCount !== undefined ? { readLineCount: input.lineCount } : {}),
    ...(input.lineOffset !== undefined
      ? { readLineOffset: input.lineOffset }
      : {}),
  };
}

export function buildReadFragmentPlanFields(
  input: ReadFragmentPlanInput,
): Pick<
  WorkflowTaskPlan,
  | "readFragmentLineIndexes"
  | "readFragmentRanges"
  | "readFragmentSourceWindowStart"
  | "readFragmentSourceWindowEnd"
  | "readFragmentFingerprint"
  | "readFilter"
> {
  return {
    ...(input.lineIndexes?.length
      ? { readFragmentLineIndexes: input.lineIndexes }
      : {}),
    ...(input.ranges?.length ? { readFragmentRanges: input.ranges } : {}),
    ...(input.sourceWindowStart !== undefined
      ? { readFragmentSourceWindowStart: input.sourceWindowStart }
      : {}),
    ...(input.sourceWindowEnd !== undefined
      ? { readFragmentSourceWindowEnd: input.sourceWindowEnd }
      : {}),
    ...(input.fingerprint
      ? { readFragmentFingerprint: input.fingerprint }
      : {}),
    ...(input.filter ? { readFilter: input.filter } : {}),
  };
}

export function buildContextPlanningRequestFields(
  prompt: string,
): Pick<WorkflowTaskPlan, "contextPlanningRequested" | "contextPlanningReason"> {
  return shouldBuildContextPlanningSurface(prompt)
    ? {
        contextPlanningRequested: true,
        contextPlanningReason: "explicit-context-packet",
      }
    : {};
}

export interface ReadOnlyPlanInput {
  readonly reason: string;
  readonly targetPath?: string;
  readonly groundedDeliverableMode?: GroundedDeliverableMode;
  readonly readWindow?: ReadWindowPlanInput;
  readonly readFragment?: ReadFragmentPlanInput;
  readonly includeReadFragment?: boolean;
  readonly contextPrompt?: string;
  readonly repairInstruction?: GroundedRepairInstruction;
  readonly continuationLineage?: readonly string[];
  readonly usedRestoredState?: boolean;
}

export function buildReadOnlyPlan(input: ReadOnlyPlanInput): WorkflowTaskPlan {
  return {
    taskKind: "read-file",
    reason: input.reason,
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    ...(input.groundedDeliverableMode
      ? { groundedDeliverableMode: input.groundedDeliverableMode }
      : {}),
    ...(input.readWindow ? buildReadWindowPlanFields(input.readWindow) : {}),
    ...(input.includeReadFragment && input.readFragment
      ? buildReadFragmentPlanFields(input.readFragment)
      : {}),
    ...(input.contextPrompt
      ? buildContextPlanningRequestFields(input.contextPrompt)
      : {}),
    inspectFirst: true,
    verifyAfterEdit: false,
    usedRestoredState: input.usedRestoredState,
    ...(input.repairInstruction
      ? { repairInstruction: input.repairInstruction }
      : {}),
    ...(input.continuationLineage
      ? { continuationLineage: input.continuationLineage }
      : {}),
  };
}

export function buildInspectFilesPlan(input: {
  readonly reason: string;
  readonly usedRestoredState?: boolean;
}): WorkflowTaskPlan {
  return {
    taskKind: "inspect-files",
    reason: input.reason,
    inspectFirst: true,
    verifyAfterEdit: false,
    usedRestoredState: input.usedRestoredState,
  };
}
