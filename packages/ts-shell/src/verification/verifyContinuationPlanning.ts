import {
  buildWorkflowVerifyContinuation,
  inferWorkflowVerifyCommand,
  isWorkflowVerifyResumeEligible,
  type VerifyContinuationObject,
} from "../orchestration/continuationModule.js";
import type { ContinuityStateLike } from "../orchestration/runtimeHandoffProjection.js";
import type {
  ReflectiveStateQueryKind,
  WorkflowTaskPlan,
} from "../orchestration/workflowTaskPlanner.js";

export interface VerifyContinuationPlanningResult {
  readonly hasVerifyLineageHint: boolean;
  readonly hasBlockedVerifyResumeContext: boolean;
  readonly hasVerifyObjectCue: boolean;
  readonly verifyContinuationTargetPath?: string;
  readonly verifyObject?: VerifyContinuationObject;
  readonly plan?: WorkflowTaskPlan;
}

export function prefersTestOverBuildInFollowUp(prompt: string): boolean {
  return /(?:\u5148\u522b\u8dd1\s*build|\u5148\u770b\s*test|\u5148\u4fee\s*test|dont run build|don't run build|run tests first|test first)/i.test(
    prompt,
  );
}

export function isVerifyContinuationFollowUpPrompt(prompt: string): boolean {
  return /(?:\b(?:continue|rerun|re-run|retry|run|execute)\b.*\b(?:verify|verification|test|tests|build|lint|check)\b|\b(?:verify|verification|test|tests|build|lint|check)\b.*\b(?:again|retry|rerun|re-run|continue)\b|\u7ee7\u7eed.*(?:\u9a8c\u8bc1|\u6d4b\u8bd5|\u6784\u5efa|\u7f16\u8bd1|\u68c0\u67e5)|\u91cd\u8dd1.*(?:\u6d4b\u8bd5|\u6784\u5efa|\u7f16\u8bd1)|\u518d\u8dd1.*(?:\u6d4b\u8bd5|\u6784\u5efa|\u7f16\u8bd1))/i.test(
    prompt,
  );
}

export function isPostEditReadOnlyVerifyFollowUp(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const hasVerifyOrCheck =
    /\b(?:verify|verification|check|confirm|ensure|make sure)\b/i.test(
      normalized,
    ) || /(?:\u9a8c\u8bc1|\u68c0\u67e5|\u786e\u8ba4)/i.test(normalized);
  if (!hasVerifyOrCheck) {
    return false;
  }
  const referencesPriorEdit =
    /\b(?:last|previous|prior|recent)\s+(?:change|edit|modification|update)\b/i.test(
      normalized,
    ) ||
    /\b(?:changed file|changed files|the change|the edit)\b/i.test(
      normalized,
    ) ||
    /(?:\u4e0a\u4e00\u6b21|\u521a\u624d|\u4e0a\u8f6e).*(?:\u4fee\u6539|\u6539\u52a8)/i.test(
      normalized,
    );
  const readOnlyCheck =
    /\b(?:contains|include|includes|has|matches|stays|remains)\b/i.test(
      normalized,
    ) ||
    /\b(?:do not|don't|dont|without)\s+(?:edit|modify|change|touch|write|replace|fix)\b/i.test(
      normalized,
    ) ||
    /(?:\u5305\u542b|\u4e0d\u8981\s*(?:\u4fee\u6539|\u5199\u5165|\u66ff\u6362))/i.test(
      normalized,
    );
  return referencesPriorEdit || readOnlyCheck;
}

export function buildVerifyContinuationPlanning(input: {
  readonly continuity: ContinuityStateLike;
  readonly primaryTargetPath?: string;
  readonly primaryTargetInWorkspace: boolean;
  readonly rawContinuityTargetPath?: string;
  readonly effectiveVerifyCommand?: string;
  readonly hasVerifyContinuationCue: boolean;
  readonly hasDiagnosticVerifyHandoffCue: boolean;
  readonly reflectiveStateQueryKind?: ReflectiveStateQueryKind;
  readonly hasReflectiveActionCue: boolean;
  readonly hasVerifyIntent: boolean;
  readonly hasExecutionCorrectionCue: boolean;
  readonly lastTaskHadVerifySignal: boolean;
  readonly workspaceRoot: string;
  readonly usedRestoredState: boolean;
  readonly continuationLineage?: readonly string[];
}): VerifyContinuationPlanningResult {
  const hasVerifyLineageHint = Boolean(
    inferWorkflowVerifyCommand(input.continuity),
  );
  const hasBlockedVerifyResumeContext =
    input.continuity.lastVerificationStatus === "blocked" &&
    Boolean(inferWorkflowVerifyCommand(input.continuity)) &&
    isWorkflowVerifyResumeEligible(input.continuity);
  const hasVerifyContinuationStateSignal =
    input.hasDiagnosticVerifyHandoffCue ||
    input.lastTaskHadVerifySignal ||
    hasVerifyLineageHint ||
    Boolean(input.rawContinuityTargetPath);
  const hasVerifyObjectCue =
    (input.hasVerifyContinuationCue ||
      input.hasDiagnosticVerifyHandoffCue ||
      (input.reflectiveStateQueryKind === "next-step" &&
        input.hasReflectiveActionCue &&
        (input.hasVerifyIntent || hasBlockedVerifyResumeContext))) &&
    (input.hasExecutionCorrectionCue || hasVerifyContinuationStateSignal);
  const verifyContinuationTargetPath = input.primaryTargetInWorkspace
    ? input.primaryTargetPath
    : hasVerifyObjectCue
      ? input.rawContinuityTargetPath
      : undefined;
  const verifyObject = hasVerifyObjectCue
    ? buildWorkflowVerifyContinuation({
        continuity: input.continuity,
        targetPath: verifyContinuationTargetPath,
        command: input.effectiveVerifyCommand,
      })
    : undefined;
  const plan = buildVerifyContinuationPlan({
    verifyObject,
    hasVerifyObjectCue,
    workspaceRoot: input.workspaceRoot,
    usedRestoredState: input.usedRestoredState,
    continuationLineage: input.continuationLineage,
  });
  return {
    hasVerifyLineageHint,
    hasBlockedVerifyResumeContext,
    hasVerifyObjectCue,
    verifyContinuationTargetPath,
    verifyObject,
    plan,
  };
}

function buildVerifyContinuationPlan(input: {
  readonly verifyObject?: VerifyContinuationObject;
  readonly hasVerifyObjectCue: boolean;
  readonly workspaceRoot: string;
  readonly usedRestoredState: boolean;
  readonly continuationLineage?: readonly string[];
}): WorkflowTaskPlan | undefined {
  if (!input.verifyObject || !input.hasVerifyObjectCue) {
    return undefined;
  }
  if (
    input.verifyObject.commandCwd &&
    normalizePathLike(input.verifyObject.commandCwd) !==
      normalizePathLike(input.workspaceRoot)
  ) {
    return {
      taskKind: "run-command",
      reason:
        "verify continuation requested, but structured verify object points to a different workspace authority",
      inspectFirst: false,
      verifyAfterEdit: false,
      blockedReason:
        "Verify continuation is unavailable: rebased workspace authority mismatch for verify command cwd.",
      targetMissing: !input.verifyObject.targetPath,
      usedRestoredState: input.usedRestoredState,
    };
  }
  if (!input.verifyObject.executableNow) {
    return {
      taskKind: "run-command",
      reason:
        "verify continuation requested, but structured verify object is incomplete",
      inspectFirst: false,
      verifyAfterEdit: false,
      blockedReason: `Verify continuation is unavailable: missing ${input.verifyObject.missingFields.join(", ")}.`,
      targetMissing: !input.verifyObject.targetPath,
      usedRestoredState: input.usedRestoredState,
    };
  }
  return {
    taskKind: "run-command",
    reason: "verify continuation resolved from structured blocker/failure lineage",
    targetPath: input.verifyObject.targetPath,
    inspectFirst: false,
    verifyAfterEdit: false,
    directCommand: input.verifyObject.command,
    usedRestoredState: input.usedRestoredState,
    continuationLineage: input.continuationLineage,
  };
}

function normalizePathLike(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}
