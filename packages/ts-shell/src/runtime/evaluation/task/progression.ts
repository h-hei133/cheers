import {
  projectTaskLoopProgression,
  type TaskLoopModelSource,
  type TaskLoopMode,
  type TaskLoopRun,
  type TaskLoopStage,
  type TaskLoopStageName,
  type TaskLoopStageStatus,
  type TaskProgression,
} from "./loop.js";

export type TaskProgressionMode = TaskLoopMode;
export type TaskProgressionModelSource = TaskLoopModelSource;
export type TaskProgressionStageName = TaskLoopStageName;
export type TaskProgressionStageStatus = TaskLoopStageStatus;
export type TaskProgressionStage = TaskLoopStage;
export type { TaskProgression } from "./loop.js";
export interface CaseProgressionInput {
  readonly taskLoop: TaskLoopRun;
  readonly taskVerdict: { readonly completeProof?: boolean };
  readonly notProvenClaims: readonly string[];
}

export function projectCaseProgression(result: CaseProgressionInput): TaskProgression {
  return projectTaskLoopProgression({
    loop: result.taskLoop,
    completeProof: result.taskVerdict.completeProof === true,
    notProvenClaims: result.notProvenClaims,
  });
}
