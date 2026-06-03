import type { TaskCaseResult } from "./model.js";
import {
  projectTaskLoopProgression,
  type TaskLoopModelSource,
  type TaskLoopMode,
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

export function projectCaseProgression(result: Omit<TaskCaseResult, "progression">): TaskProgression {
  return projectTaskLoopProgression({
    loop: result.taskLoop,
    completeProof: result.taskVerdict.completeProof === true,
    notProvenClaims: result.notProvenClaims,
  });
}
