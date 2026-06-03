import type { ArtifactCorrection } from "../../artifacts/workflow/model.js";
import type { RepairAction } from "../../repair/loop/model.js";
import type { ToolStrategy } from "../../tools/policy/strategy.js";
import type { VerificationSelection } from "../selection/model.js";

export type VerificationExecutionState = "passed" | "partial" | "failed" | "blocked" | "not-run";

export interface VerificationExecutionInput {
  readonly selection: VerificationSelection;
  readonly strategy: ToolStrategy;
  readonly repairAction?: RepairAction;
  readonly artifactCorrection?: ArtifactCorrection;
  readonly contextReady: boolean;
}

export interface VerificationExecution {
  readonly state: VerificationExecutionState;
  readonly evidenceInputEligible: boolean;
  readonly resultInputEligible: boolean;
  readonly blockers: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function executeVerification(input: VerificationExecutionInput): VerificationExecution {
  if (input.strategy.state === "blocked" || !input.contextReady) {
    return result("blocked", ["verification blocked"]);
  }
  if (input.repairAction?.postValidation === "passed") {
    return result("passed", []);
  }
  if (input.repairAction?.postValidation === "partial") {
    return result("partial", ["repair verification incomplete"]);
  }
  if (input.artifactCorrection?.validationState === "validation-passed") {
    return result("passed", []);
  }
  if (input.artifactCorrection?.validationState === "validation-failed") {
    return result("failed", ["artifact validation failed"]);
  }
  if (input.selection.state === "selected-passed") {
    return result("passed", []);
  }
  if (input.selection.state === "selected-failed") {
    return result("failed", ["verification failed"]);
  }
  if (input.selection.state === "insufficient") {
    return result("partial", ["insufficient verification"]);
  }
  if (input.selection.state === "selected-not-run") {
    return result("partial", ["verification rerun required for complete proof"]);
  }
  if (input.selection.state === "selected-blocked" && input.contextReady) {
    return result("partial", ["verification blocked after context selection"]);
  }
  if (input.selection.state === "not-selected") {
    return result("not-run", ["verification not selected"]);
  }
  return result("blocked", input.selection.blockers);
}

function result(
  state: VerificationExecutionState,
  blockers: readonly string[],
): VerificationExecution {
  const passed = state === "passed";
  return freeze({
    state,
    evidenceInputEligible: passed,
    resultInputEligible: passed,
    blockers,
    terminalSuccessClaim: false,
  });
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
