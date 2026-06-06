import type {
  AgentExecutionOutput,
  AgentRole,
  CodingResultSummary,
  CodingTaskKind,
} from "../../../orchestration/types.js";
import type { ToolActionKind } from "../../../tools/policy/strategy.js";
import type { QueryRuntimeActionDecision } from "./decision.js";

export interface RuntimeActionBlock {
  readonly action: ToolActionKind;
  readonly reason: string;
  readonly targetFiles: readonly string[];
}

export function blockUnsafeRuntimeAction(
  decision: QueryRuntimeActionDecision,
): RuntimeActionBlock | undefined {
  if (decision.nextAction === "edit" && decision.selectedPaths.length === 0 && decision.ownerPaths.length === 0) {
    return {
      action: "edit",
      reason: "runtime action blocked: discovery required before edit",
      targetFiles: decision.changedFiles,
    };
  }

  if (decision.nextAction === "repair" &&
    decision.selectedPaths.length === 0 &&
    decision.ownerPaths.length === 0 &&
    decision.proofGap.some(needsContext)) {
    return {
      action: "repair",
      reason: "runtime action blocked: discovery required before repair",
      targetFiles: decision.changedFiles,
    };
  }

  if (decision.nextAction === "verify" && decision.changedFiles.length > 0 && decision.verificationTargets.length === 0) {
    return {
      action: "verify",
      reason: "runtime action blocked: targeted verification required",
      targetFiles: decision.changedFiles,
    };
  }

  if (decision.nextAction === "artifact" &&
    decision.pendingAction === "artifact" &&
    decision.selectedPaths.length === 0 &&
    decision.ownerPaths.length === 0 &&
    decision.changedFiles.length === 0 &&
    decision.verificationTargets.length === 0) {
    return {
      action: "artifact",
      reason: "runtime action blocked: artifact target required",
      targetFiles: [],
    };
  }

  return undefined;
}

export function constrainRuntimeActionOutput(
  decision: QueryRuntimeActionDecision,
  output: AgentExecutionOutput,
): AgentExecutionOutput {
  const block = blockMismatchedVerification(decision, output);
  const artifactBlock = blockMismatchedArtifact(decision, output);
  if (!block && !artifactBlock) {
    return output;
  }
  return blockedRuntimeActionOutput({
    role: output.role,
    block: block ?? artifactBlock!,
    taskKind: taskKindForAction((block ?? artifactBlock!).action),
    changedFiles: decision.changedFiles,
    evidenceFiles: decision.verificationTargets,
  });
}

export function blockedRuntimeActionOutput(input: {
  readonly role: AgentRole;
  readonly block: RuntimeActionBlock;
  readonly taskKind?: CodingTaskKind;
  readonly changedFiles?: readonly string[];
  readonly evidenceFiles?: readonly string[];
}): AgentExecutionOutput {
  const taskId = `runtime_action_${input.block.action}`;
  return {
    role: input.role,
    content: input.block.reason,
    handoffTo: nextRoleForBlockedAction(input.role),
    handoffReason: input.block.reason,
    events: [
      { type: "tool.started", toolName: input.block.action, taskId },
      {
        type: "tool.result",
        toolName: input.block.action,
        taskId,
        success: false,
        failureReason: input.block.reason,
      },
    ],
    codingResult: blockedCodingResult({
      taskKind: input.taskKind ?? taskKindForAction(input.block.action),
      changedFiles: input.changedFiles ?? input.block.targetFiles,
      evidenceFiles: input.evidenceFiles ?? input.block.targetFiles,
      reason: input.block.reason,
      action: input.block.action,
    }),
  };
}

function nextRoleForBlockedAction(role: AgentRole): AgentRole {
  if (role === "planner") return "coder";
  if (role === "coder") return "reviewer";
  return "coder";
}

function blockMismatchedVerification(
  decision: QueryRuntimeActionDecision,
  output: AgentExecutionOutput,
): RuntimeActionBlock | undefined {
  const result = output.codingResult;
  if (decision.nextAction !== "verify" || decision.verificationTargets.length === 0 || !result) {
    return undefined;
  }
  if (result.verification.status !== "passed") {
    return undefined;
  }
  const verifiedFiles = new Set(result.verifiedFiles);
  const missingTargets = decision.verificationTargets.filter((target) => !verifiedFiles.has(target));
  const genericScope = result.verification.selectionScope === "broader" || result.verification.selectionScope === "none";
  const genericTarget = result.lastActionResultSeed?.target === "workspace" ||
    result.lastActionResultSeed?.target === "all" ||
    result.lastActionResultSeed?.target === ".";
  if (!genericScope && !genericTarget) {
    return undefined;
  }
  return {
    action: "verify",
    reason: "runtime action blocked: targeted verification required",
    targetFiles: missingTargets.length > 0 ? missingTargets : decision.verificationTargets,
  };
}

function blockMismatchedArtifact(
  decision: QueryRuntimeActionDecision,
  output: AgentExecutionOutput,
): RuntimeActionBlock | undefined {
  const result = output.codingResult;
  if (decision.nextAction !== "artifact" || !decision.artifactRequired || !result) {
    return undefined;
  }
  if (result.taskSatisfaction.verdict !== "satisfied") {
    return undefined;
  }
  const evidence = result.taskSatisfaction.observedEvidence.join(" ").toLowerCase();
  const hasSourceEvidence = evidence.includes("source") || result.diagnosis?.evidenceFiles.length > 0;
  const hasVerificationEvidence = evidence.includes("verification") || evidence.includes("verify") || result.verifiedFiles.length > 0;
  if (hasSourceEvidence && hasVerificationEvidence) {
    return undefined;
  }
  return {
    action: "artifact",
    reason: "runtime action blocked: artifact requires source and verification evidence",
    targetFiles: decision.changedFiles,
  };
}


function blockedCodingResult(input: {
  readonly taskKind: CodingTaskKind;
  readonly changedFiles: readonly string[];
  readonly evidenceFiles: readonly string[];
  readonly reason: string;
  readonly action: ToolActionKind;
}): CodingResultSummary {
  const changedFiles = [...input.changedFiles];
  const evidenceFiles = [...input.evidenceFiles];
  const requiredEvidence = [`runtime action satisfied: ${input.action}`];
  return {
    taskKind: input.taskKind,
    diagnosis: {
      disposition: "insufficient-evidence",
      candidateFiles: [],
      evidenceFiles,
      searchPattern: "runtime action",
      reason: input.reason,
      evidenceNodes: [],
      evidenceLinks: [],
    },
    changedFiles,
    failedFiles: input.action === "verify"
      ? evidenceFiles.map((path) => ({ path, reason: input.reason }))
      : [],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: [],
    },
    changeSet: {
      gitAware: true,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: changedFiles,
      attemptedFiles: [...changedFiles, ...evidenceFiles],
      changedFiles,
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: [input.reason],
      requiredEvidence,
      observedEvidence: [],
    },
    verifiedFiles: [],
    unverifiedFiles: changedFiles.map((path) => ({ path, reason: input.reason })),
    verification: {
      status: input.action === "verify" ? "blocked" : "not-requested",
      reason: input.reason,
      selectionScope: input.action === "verify" ? "focused" : "none",
      selectionSource: input.action === "verify" ? "auto-from-changes" : "not-requested",
      blockerKind: input.action === "verify" ? "no-verify-strategy" : undefined,
    },
    evidence: [],
    lastActionResultSeed: {
      actionKind: taskKindForAction(input.action),
      changedFiles,
      verifiedFiles: [],
      verification: {
        status: input.action === "verify" ? "blocked" : "not-requested",
        reason: input.reason,
        blockerKind: input.action === "verify" ? "no-verify-strategy" : undefined,
      },
      reason: input.reason,
      blockerKind: input.action === "verify" ? "no-verify-strategy" : undefined,
    },
  };
}

function taskKindForAction(action: ToolActionKind): CodingTaskKind {
  switch (action) {
    case "search":
      return "repo-explain";
    case "read":
      return "read-file";
    case "edit":
    case "repair":
    case "artifact":
      return "edit-file";
    case "verify":
      return "run-command";
    case "continue":
    case "stop-not-proven":
      return "chat";
  }
}

function needsContext(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized.includes("context") || normalized.includes("owner") || normalized.includes("missing");
}
