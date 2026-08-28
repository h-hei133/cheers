import type { ContextEngineResult } from "../../context/acquisition/engine.js";
import type { PlanningUnsupportedClassification } from "./types.js";

export function isReadOnlyPlanningTask(
  taskKind: ContextEngineResult["workflowPlan"]["taskKind"],
): boolean {
  return (
    taskKind === "read-file" ||
    taskKind === "inspect-files" ||
    taskKind === "repo-explain"
  );
}

export function isBroadRefactorRequest(userTask: string): boolean {
  return (
    /\b(refactor|rewrite|change|fix)\s+(all|everything|entire|whole)\b/i.test(
      userTask,
    ) || /\b(entire|whole)\s+(repo|repository|codebase)\b/i.test(userTask)
  );
}

export function requiresProviderButDisabled(userTask: string): boolean {
  return /\b(real provider|live provider|call provider|use provider)\b/i.test(
    userTask,
  );
}

export function requestsUnsafeAuthority(userTask: string): boolean {
  return (
    /\b(apply|write|modify)\b.*\b(without|no)\s+(approval|permission|confirmation)\b/i.test(
      userTask,
    ) || /\bskip\s+(verification|permission|approval)\b/i.test(userTask)
  );
}

export function isCodeLikePrimaryTarget(
  role: NonNullable<ContextEngineResult["selectedCandidate"]>["role"] | undefined,
): boolean {
  return role === "source" || role === "test" || role === "entrypoint";
}

export function buildUnsupportedClassification(input: {
  readonly userTask: string;
  readonly context: ContextEngineResult;
}): PlanningUnsupportedClassification | undefined {
  const reasons: string[] = [];
  const unsafeReasons: string[] = [];
  const unsupportedReasons: string[] = [];

  if (isBroadRefactorRequest(input.userTask)) {
    unsupportedReasons.push(
      "Broad repository-wide refactoring requests require explicit bounded targets.",
    );
  }
  if (requiresProviderButDisabled(input.userTask)) {
    unsupportedReasons.push(
      "Live provider invocation requested in offline planning mode.",
    );
  }
  if (requestsUnsafeAuthority(input.userTask)) {
    unsafeReasons.push(
      "Unsafe authority requested: modifications without approval or skipping verification.",
    );
  }

  const allReasons = [...reasons, ...unsafeReasons, ...unsupportedReasons];
  if (allReasons.length === 0) {
    return undefined;
  }

  return {
    classificationId: "planning-unsupported-classification",
    reasons: allReasons,
    unsafeReasons,
    unsupportedReasons,
    commandOnlyBypassesMutationHandoff: false,
    terminalSuccessClaim: false,
    evidence: ["planning:unsupported-task"],
  };
}
