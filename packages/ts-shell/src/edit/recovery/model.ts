import { freezeDeep } from "../../core/values/freeze.js";
import path from "node:path";
import { computeFragmentFingerprint } from "../../context/readWindowContinuation.js";
import {
  buildRepairVerdictProofInput,
  type RepairVerdictProofInput,
} from "../../evidence/projection/repair/verdict.js";
import {
  createRepairApplyRequest,
  observeRepairApply,
  observeRepairAuthority,
  observeRepairProposal,
  projectRepairRequiredHandoff,
  type RepairApplyObservation,
  type RepairApplyRequestObservation,
  type RepairAuthorityObservation,
  type RepairProposalObservation,
  type RepairRequiredHandoff,
} from "../../repair/handoff/boundary.js";
import {
  projectRepairVerdictTerminal,
  type RepairVerdictTerminalProjection,
} from "../../result/projection/repair/verdict.js";
import type { ExecutionService } from "../../runtime/execution/service.js";
import type { ToolBeforePolicyDecision } from "../../tools/policy/interception.js";
import {
  observePostRepairVerificationResult,
  observeVerificationResult,
  projectVerificationIntent,
  requestPostRepairVerification,
  requirePostRepairVerification,
  type PostRepairVerificationRequirementObservation,
  type PostRepairVerificationRequestObservation,
  type PostRepairVerificationResultObservation,
  type VerificationLoopIntent,
  type VerificationResultObservation,
} from "../../verification/result/boundary.js";
import { redactReportText } from "../../core/security/redaction.js";
import {
  fingerprint,
  sanitizeId,
  sanitizeTargetSummary,
} from "../sanitize.js";

export type MutationAuthorityStatus =
  | "permission_pending"
  | "denied"
  | "granted"
  | "blocked"
  | "missing";

export type MutationStaleReadStatus =
  | "not_run"
  | "passed"
  | "stale"
  | "target_missing"
  | "failed";

export type MutationSnapshotStatus =
  | "not_planned"
  | "planned"
  | "unavailable";

export type MutationApplyStatus =
  | "not_attempted"
  | "attempted"
  | "applied"
  | "failed"
  | "blocked";

export type MutationRecoveryDecisionStatus =
  | "not_needed"
  | "rollback_required"
  | "repair_required"
  | "await_user"
  | "blocked";

export type MutationRollbackStatus =
  | "not_attempted"
  | "required"
  | "succeeded"
  | "failed";

export type MutationRecoveryVerdictStatus =
  | "complete"
  | "blocked"
  | "failed"
  | "not_proven"
  | "incomplete";

export interface ControlledMutationTarget {
  readonly relativePath: string;
  readonly expectedContent: string;
  readonly proposedContent: string;
  readonly repairContent?: string;
  readonly reportSafeTargetSummary?: string;
}

export interface ControlledMutationRecoveryInput {
  readonly laneId: string;
  readonly turnId: string;
  readonly workspaceRoot: string;
  readonly target: ControlledMutationTarget;
  readonly executionService: Pick<ExecutionService, "readTextFile" | "writeTextFile">;
  readonly toolCallId?: string;
  readonly toolPolicyDecision?: ToolBeforePolicyDecision;
  readonly authority: {
    readonly status: MutationAuthorityStatus;
    readonly source: "explicit_mutation_authority" | "tool_policy" | "prompt_text_only" | "none";
    readonly reason?: string;
  };
  readonly snapshot: {
    readonly available: boolean;
    readonly reason?: string;
  };
  readonly verification: {
    readonly status: VerificationResultObservation["status"];
    readonly failureClass?: string;
    readonly repairEligible?: boolean;
  };
  readonly recovery?: {
    readonly decision?: MutationRecoveryDecisionStatus;
    readonly repairAuthority?: "granted" | "missing" | "denied" | "blocked";
    readonly postRepairVerificationStatus?: PostRepairVerificationResultObservation["status"];
    readonly rollbackAfterVerificationFailure?: boolean;
  };
  readonly notProvenClaims?: readonly string[];
}

export interface MutationAuthorityObservation {
  readonly authorityId: string;
  readonly status: MutationAuthorityStatus;
  readonly source: ControlledMutationRecoveryInput["authority"]["source"];
  readonly reason: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MutationStaleReadObservation {
  readonly staleReadId: string;
  readonly status: MutationStaleReadStatus;
  readonly targetSummary: string;
  readonly expectedFingerprint: string;
  readonly currentFingerprint?: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MutationSnapshotObservation {
  readonly snapshotId: string;
  readonly status: MutationSnapshotStatus;
  readonly restorePlanAvailable: boolean;
  readonly targetSummary: string;
  readonly contentFingerprint?: string;
  readonly blocker?: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MutationApplyObservation {
  readonly applyId: string;
  readonly status: MutationApplyStatus;
  readonly attempted: boolean;
  readonly targetSummary: string;
  readonly contentFingerprint?: string;
  readonly blocker?: string;
  readonly failureClass?: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MutationRollbackObservation {
  readonly rollbackId: string;
  readonly status: MutationRollbackStatus;
  readonly targetSummary: string;
  readonly restorePlanAvailable: boolean;
  readonly preservesOriginalFailure: true;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface ControlledMutationRecoveryProjection {
  readonly laneId: string;
  readonly turnId: string;
  readonly toolCallId?: string;
  readonly targetSummary: string;
  readonly toolPolicyDecisionId?: string;
  readonly authority: MutationAuthorityObservation;
  readonly staleRead: MutationStaleReadObservation;
  readonly snapshot: MutationSnapshotObservation;
  readonly apply: MutationApplyObservation;
  readonly verificationIntent: VerificationLoopIntent;
  readonly verificationResult: VerificationResultObservation;
  readonly recoveryDecision: MutationRecoveryDecisionStatus;
  readonly rollback: MutationRollbackObservation;
  readonly repairRequired?: RepairRequiredHandoff;
  readonly repairProposal?: RepairProposalObservation;
  readonly repairAuthority?: RepairAuthorityObservation;
  readonly repairApplyRequest?: RepairApplyRequestObservation;
  readonly repairApply?: RepairApplyObservation;
  readonly postRepairVerificationRequirement?: PostRepairVerificationRequirementObservation;
  readonly postRepairVerificationRequest?: PostRepairVerificationRequestObservation;
  readonly postRepairVerificationResult?: PostRepairVerificationResultObservation;
  readonly repairVerdictProofInput?: RepairVerdictProofInput;
  readonly repairVerdictTerminalProjection?: RepairVerdictTerminalProjection;
  readonly verdictStatus: MutationRecoveryVerdictStatus;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export async function runControlledMutationRecovery(
  input: ControlledMutationRecoveryInput,
): Promise<ControlledMutationRecoveryProjection> {
  const targetSummary = sanitizeTargetSummary(
    input.target.reportSafeTargetSummary ?? input.target.relativePath,
  );
  const laneId = sanitizeId(input.laneId);
  const notProvenClaims = unique([
    "terminal-success",
    "task-success",
    "mutation-apply-is-not-success",
    "verification-required-for-success",
    "result-verdict-required-for-success",
    "raw-edit-content-excluded",
    ...(input.toolPolicyDecision?.notProvenClaims ?? []),
    ...(input.notProvenClaims ?? []),
  ]);
  const authority = observeMutationAuthority({ laneId, input, notProvenClaims });
  const staleRead = await observeMutationStaleRead({
    laneId,
    input,
    targetSummary,
    authority,
    notProvenClaims,
  });
  const snapshot = observeMutationSnapshot({
    laneId,
    input,
    targetSummary,
    staleRead,
    notProvenClaims,
  });
  const apply = await observeMutationApply({
    laneId,
    input,
    targetSummary,
    authority,
    staleRead,
    snapshot,
    notProvenClaims,
  });
  const verificationIntent = projectVerificationIntent({
    sourceTurnId: input.turnId,
    targetSummary: `verify controlled mutation for ${targetSummary}`,
    verificationKind: "owner_projection",
    authorityRequirement: "granted",
    dispatchStatus: apply.status === "applied" ? "dispatched" : "blocked",
    relevanceStatus: "task_relevant",
    coverageStatus: "covered",
    notProvenClaims,
  });
  const verificationResult = observeVerificationResult({
    intent: verificationIntent,
    status: apply.status === "applied" ? input.verification.status : "blocked",
    failureClass:
      apply.status === "applied"
        ? input.verification.failureClass
        : "mutation-apply-blocked",
    repairEligible: input.verification.repairEligible ?? true,
    runtimeReceiptIds: apply.status === "applied" ? [`${laneId}:apply-observation`] : [],
    safeSummary:
      apply.status === "applied"
        ? `controlled mutation verification ${input.verification.status}`
        : "controlled mutation did not reach verification",
    notProvenClaims,
  });
  const recoveryDecision = decideRecovery({
    apply,
    verificationResult,
    input,
  });
  const rollback = await observeMutationRollback({
    laneId,
    input,
    targetSummary,
    snapshot,
    recoveryDecision,
    verificationResult,
    notProvenClaims,
  });
  const repairChain = await buildRepairChain({
    laneId,
    input,
    targetSummary,
    recoveryDecision,
    verificationResult,
    notProvenClaims,
  });
  const repairVerdictTerminalProjection = repairChain.repairVerdictTerminalProjection;
  const verdictStatus = verdictStatusFor({
    recoveryDecision,
    apply,
    verificationResult,
    rollback,
    repairVerdictTerminalProjection,
  });
  return freezeDeep({
    laneId,
    turnId: redactReportText(input.turnId, 180),
    ...(input.toolCallId ? { toolCallId: redactReportText(input.toolCallId, 120) } : {}),
    targetSummary,
    ...(input.toolPolicyDecision
      ? { toolPolicyDecisionId: input.toolPolicyDecision.decisionId }
      : {}),
    authority,
    staleRead,
    snapshot,
    apply,
    verificationIntent,
    verificationResult,
    recoveryDecision,
    rollback,
    ...repairChain,
    verdictStatus,
    redactionStatus: "report-safe",
    notProvenClaims: unique([
      ...notProvenClaims,
      ...authority.notProvenClaims,
      ...staleRead.notProvenClaims,
      ...snapshot.notProvenClaims,
      ...apply.notProvenClaims,
      ...verificationIntent.notProvenClaims,
      ...verificationResult.notProvenClaims,
      ...rollback.notProvenClaims,
      ...(repairVerdictTerminalProjection?.notProvenClaims ?? []),
      ...(verdictStatus === "complete" ? ["result-owned-verdict-complete"] : ["missing-result-owned-complete-proof"]),
    ]),
    terminalSuccessClaim: false,
  });
}

function observeMutationAuthority(input: {
  readonly laneId: string;
  readonly input: ControlledMutationRecoveryInput;
  readonly notProvenClaims: readonly string[];
}): MutationAuthorityObservation {
  const status = input.input.authority.source === "prompt_text_only" &&
      input.input.authority.status === "granted"
    ? "blocked"
    : input.input.authority.status;
  return freezeDeep({
    authorityId: `${input.laneId}:authority`,
    status,
    source: input.input.authority.source,
    reason: redactReportText(input.input.authority.reason ?? reasonForAuthority(status), 180),
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "authority-is-not-success",
      "authority-is-not-apply",
      ...input.notProvenClaims,
    ]),
  });
}

async function observeMutationStaleRead(input: {
  readonly laneId: string;
  readonly input: ControlledMutationRecoveryInput;
  readonly targetSummary: string;
  readonly authority: MutationAuthorityObservation;
  readonly notProvenClaims: readonly string[];
}): Promise<MutationStaleReadObservation> {
  const expectedFingerprint = fingerprint(input.input.target.expectedContent);
  if (input.authority.status !== "granted") {
    return freezeDeep({
      staleReadId: `${input.laneId}:stale-read`,
      status: "not_run",
      targetSummary: input.targetSummary,
      expectedFingerprint,
      terminalSuccessClaim: false,
      notProvenClaims: unique([
        "stale-read-not-run-is-not-success",
        ...input.notProvenClaims,
      ]),
    });
  }
  try {
    const current = await input.input.executionService.readTextFile({
      operationKind: "file.read",
      absolutePath: absoluteTargetPath(input.input),
      workspaceRoot: input.input.workspaceRoot,
      authority: {
        mode: "approved-for-write",
        source: "workspace-authority",
        reason: "final stale-read before controlled mutation",
      },
      caller: "edit-recovery",
      reason: "final stale-read before controlled mutation",
      reportSafeTarget: input.targetSummary,
    });
    const currentFingerprint = fingerprint(current);
    return freezeDeep({
      staleReadId: `${input.laneId}:stale-read`,
      status: current === input.input.target.expectedContent ? "passed" : "stale",
      targetSummary: input.targetSummary,
      expectedFingerprint,
      currentFingerprint,
      terminalSuccessClaim: false,
      notProvenClaims: unique([
        "stale-read-passed-is-not-success",
        ...input.notProvenClaims,
      ]),
    });
  } catch {
    return freezeDeep({
      staleReadId: `${input.laneId}:stale-read`,
      status: "target_missing",
      targetSummary: input.targetSummary,
      expectedFingerprint,
      terminalSuccessClaim: false,
      notProvenClaims: unique([
        "stale-read-target-missing-is-not-success",
        ...input.notProvenClaims,
      ]),
    });
  }
}

function observeMutationSnapshot(input: {
  readonly laneId: string;
  readonly input: ControlledMutationRecoveryInput;
  readonly targetSummary: string;
  readonly staleRead: MutationStaleReadObservation;
  readonly notProvenClaims: readonly string[];
}): MutationSnapshotObservation {
  if (input.staleRead.status !== "passed") {
    return freezeDeep({
      snapshotId: `${input.laneId}:snapshot`,
      status: "not_planned",
      restorePlanAvailable: false,
      targetSummary: input.targetSummary,
      blocker: `stale-read:${input.staleRead.status}`,
      terminalSuccessClaim: false,
      notProvenClaims: unique([
        "snapshot-not-planned-is-not-success",
        ...input.notProvenClaims,
      ]),
    });
  }
  if (!input.input.snapshot.available) {
    return freezeDeep({
      snapshotId: `${input.laneId}:snapshot`,
      status: "unavailable",
      restorePlanAvailable: false,
      targetSummary: input.targetSummary,
      blocker: redactReportText(input.input.snapshot.reason ?? "snapshot unavailable", 160),
      terminalSuccessClaim: false,
      notProvenClaims: unique([
        "snapshot-unavailable-is-not-success",
        ...input.notProvenClaims,
      ]),
    });
  }
  return freezeDeep({
    snapshotId: `${input.laneId}:snapshot`,
    status: "planned",
    restorePlanAvailable: true,
    targetSummary: input.targetSummary,
    contentFingerprint: fingerprint(input.input.target.expectedContent),
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "snapshot-planned-is-not-success",
      "restore-plan-is-not-success",
      ...input.notProvenClaims,
    ]),
  });
}

async function observeMutationApply(input: {
  readonly laneId: string;
  readonly input: ControlledMutationRecoveryInput;
  readonly targetSummary: string;
  readonly authority: MutationAuthorityObservation;
  readonly staleRead: MutationStaleReadObservation;
  readonly snapshot: MutationSnapshotObservation;
  readonly notProvenClaims: readonly string[];
}): Promise<MutationApplyObservation> {
  const blocker = applyBlocker(input.authority, input.staleRead, input.snapshot);
  if (blocker) {
    return freezeDeep({
      applyId: `${input.laneId}:apply`,
      status: "blocked",
      attempted: false,
      targetSummary: input.targetSummary,
      blocker,
      terminalSuccessClaim: false,
      notProvenClaims: unique([
        "apply-blocked-is-not-success",
        ...input.notProvenClaims,
      ]),
    });
  }
  try {
    await input.input.executionService.writeTextFile({
      operationKind: "file.write",
      absolutePath: absoluteTargetPath(input.input),
      content: input.input.target.proposedContent,
      workspaceRoot: input.input.workspaceRoot,
      authority: {
        mode: "approved-for-write",
        source: "workspace-authority",
        reason: "controlled mutation authority granted",
      },
      caller: "edit-recovery",
      reason: "controlled mutation apply",
      reportSafeTarget: input.targetSummary,
    });
    return freezeDeep({
      applyId: `${input.laneId}:apply`,
      status: "applied",
      attempted: true,
      targetSummary: input.targetSummary,
      contentFingerprint: fingerprint(input.input.target.proposedContent),
      terminalSuccessClaim: false,
      notProvenClaims: unique([
        "apply-observation-is-not-success",
        "apply-applied-is-not-task-success",
        ...input.notProvenClaims,
      ]),
    });
  } catch (error) {
    return freezeDeep({
      applyId: `${input.laneId}:apply`,
      status: "failed",
      attempted: true,
      targetSummary: input.targetSummary,
      failureClass: error instanceof Error ? redactReportText(error.name, 80) : "unknown",
      terminalSuccessClaim: false,
      notProvenClaims: unique([
        "apply-failed-is-not-success",
        ...input.notProvenClaims,
      ]),
    });
  }
}

async function observeMutationRollback(input: {
  readonly laneId: string;
  readonly input: ControlledMutationRecoveryInput;
  readonly targetSummary: string;
  readonly snapshot: MutationSnapshotObservation;
  readonly recoveryDecision: MutationRecoveryDecisionStatus;
  readonly verificationResult: VerificationResultObservation;
  readonly notProvenClaims: readonly string[];
}): Promise<MutationRollbackObservation> {
  const required = input.recoveryDecision === "rollback_required" ||
    Boolean(input.input.recovery?.rollbackAfterVerificationFailure);
  if (!required) {
    return freezeDeep({
      rollbackId: `${input.laneId}:rollback`,
      status: "not_attempted",
      targetSummary: input.targetSummary,
      restorePlanAvailable: input.snapshot.restorePlanAvailable,
      preservesOriginalFailure: true,
      terminalSuccessClaim: false,
      notProvenClaims: unique(["rollback-not-attempted-is-not-success", ...input.notProvenClaims]),
    });
  }
  if (!input.snapshot.restorePlanAvailable) {
    return freezeDeep({
      rollbackId: `${input.laneId}:rollback`,
      status: "failed",
      targetSummary: input.targetSummary,
      restorePlanAvailable: false,
      preservesOriginalFailure: true,
      terminalSuccessClaim: false,
      notProvenClaims: unique(["rollback-without-restore-plan-is-not-success", ...input.notProvenClaims]),
    });
  }
  try {
    await input.input.executionService.writeTextFile({
      operationKind: "file.write",
      absolutePath: absoluteTargetPath(input.input),
      content: input.input.target.expectedContent,
      workspaceRoot: input.input.workspaceRoot,
      authority: {
        mode: "approved-for-write",
        source: "workspace-authority",
        reason: "controlled restore plan after failed verification",
      },
      caller: "edit-recovery",
      reason: "controlled mutation restore",
      reportSafeTarget: input.targetSummary,
    });
    return freezeDeep({
      rollbackId: `${input.laneId}:rollback`,
      status: "succeeded",
      targetSummary: input.targetSummary,
      restorePlanAvailable: true,
      preservesOriginalFailure: true,
      terminalSuccessClaim: false,
      notProvenClaims: unique([
        "rollback-succeeded-is-not-task-success",
        "original-verification-failure-preserved",
        ...input.verificationResult.notProvenClaims,
        ...input.notProvenClaims,
      ]),
    });
  } catch {
    return freezeDeep({
      rollbackId: `${input.laneId}:rollback`,
      status: "failed",
      targetSummary: input.targetSummary,
      restorePlanAvailable: true,
      preservesOriginalFailure: true,
      terminalSuccessClaim: false,
      notProvenClaims: unique(["rollback-failed-is-not-success", ...input.notProvenClaims]),
    });
  }
}

async function buildRepairChain(input: {
  readonly laneId: string;
  readonly input: ControlledMutationRecoveryInput;
  readonly targetSummary: string;
  readonly recoveryDecision: MutationRecoveryDecisionStatus;
  readonly verificationResult: VerificationResultObservation;
  readonly notProvenClaims: readonly string[];
}): Promise<Partial<Pick<
  ControlledMutationRecoveryProjection,
  | "repairRequired"
  | "repairProposal"
  | "repairAuthority"
  | "repairApplyRequest"
  | "repairApply"
  | "postRepairVerificationRequirement"
  | "postRepairVerificationRequest"
  | "postRepairVerificationResult"
  | "repairVerdictProofInput"
  | "repairVerdictTerminalProjection"
>>> {
  if (input.recoveryDecision !== "repair_required") {
    return {};
  }
  const repairRequired = projectRepairRequiredHandoff({
    verification: input.verificationResult,
    repairabilityStatus: "repair_required",
    repairBlocker: "none",
    suggestedRepairMode: "existing_owner",
    authorityRequirement: "required",
    notProvenClaims: input.notProvenClaims,
  });
  const repairProposal = observeRepairProposal({
    handoff: repairRequired,
    proposalSource: "existing_repair_owner_projection",
    targetSummary: input.targetSummary,
    readinessStatus: "exact_ready",
    authorityRequirement: "required",
    notProvenClaims: input.notProvenClaims,
  });
  const repairAuthority = observeRepairAuthority({
    proposal: repairProposal,
    authorityDecision: input.input.recovery?.repairAuthority ?? "missing",
    authoritySource: input.input.recovery?.repairAuthority === "granted"
      ? "explicit_repair_authority"
      : "none",
    notProvenClaims: input.notProvenClaims,
  });
  const repairApplyRequest = createRepairApplyRequest({
    proposal: repairProposal,
    authority: repairAuthority,
    expectedEditOperationKind: "single_target",
    notProvenClaims: input.notProvenClaims,
  });
  const repairContent = input.input.target.repairContent;
  const canApplyRepair = repairApplyRequest.applyReadiness === "ready" &&
    repairContent !== undefined;
  if (canApplyRepair) {
    await input.input.executionService.writeTextFile({
      operationKind: "file.write",
      absolutePath: absoluteTargetPath(input.input),
      content: repairContent,
      workspaceRoot: input.input.workspaceRoot,
      authority: {
        mode: "approved-for-write",
        source: "workspace-authority",
        reason: "controlled repair authority granted",
      },
      caller: "edit-recovery",
      reason: "controlled repair apply",
      reportSafeTarget: input.targetSummary,
    });
  }
  const repairApply = observeRepairApply({
    proposal: repairProposal,
    authority: repairAuthority,
    request: repairApplyRequest,
    repairApplyStatus: canApplyRepair ? "applied" : "authority_required",
    applyReceiptIds: canApplyRepair ? [`${input.laneId}:repair-apply-observation`] : [],
    touchedTargetSummaries: canApplyRepair ? [input.targetSummary] : [],
    postRepairVerificationStatus: repairApplyPostVerificationStatus(
      input.input.recovery?.postRepairVerificationStatus,
    ),
    notProvenClaims: input.notProvenClaims,
  });
  const postRepairVerificationRequirement = requirePostRepairVerification({
    repairApply,
    notProvenClaims: input.notProvenClaims,
  });
  const postRepairVerificationRequest = requestPostRepairVerification({
    requirement: postRepairVerificationRequirement,
    selectedCommandSummary: `owner verification for ${input.targetSummary}`,
    dispatchStatus: input.input.recovery?.postRepairVerificationStatus === "passed" ||
        input.input.recovery?.postRepairVerificationStatus === "failed"
      ? "dispatched"
      : "selected_not_run",
    receiptIds: input.input.recovery?.postRepairVerificationStatus === "passed" ||
        input.input.recovery?.postRepairVerificationStatus === "failed"
      ? [`${input.laneId}:post-repair-verification-observation`]
      : [],
    taskRelevanceStatus: "task_relevant",
    coverageStatus: "covered",
    notProvenClaims: input.notProvenClaims,
  });
  const postRepairVerificationResult = observePostRepairVerificationResult({
    requirement: postRepairVerificationRequirement,
    request: postRepairVerificationRequest,
    status: input.input.recovery?.postRepairVerificationStatus ?? "not_run",
    receiptIds: input.input.recovery?.postRepairVerificationStatus === "passed"
      ? [`${input.laneId}:post-repair-verification-observation`]
      : [],
    failureClass:
      input.input.recovery?.postRepairVerificationStatus === "failed"
        ? "post-repair-verification-failed"
        : undefined,
    taskRelevanceStatus: "task_relevant",
    coverageStatus: "covered",
    notProvenClaims: input.notProvenClaims,
  });
  const repairVerdictProofInput = buildRepairVerdictProofInput({
    postRepairVerification: postRepairVerificationResult,
    notProvenClaims: input.notProvenClaims,
  });
  const repairVerdictTerminalProjection = projectRepairVerdictTerminal({
    proofInput: repairVerdictProofInput,
    notProvenClaims: input.notProvenClaims,
  });
  return {
    repairRequired,
    repairProposal,
    repairAuthority,
    repairApplyRequest,
    repairApply,
    postRepairVerificationRequirement,
    postRepairVerificationRequest,
    postRepairVerificationResult,
    repairVerdictProofInput,
    repairVerdictTerminalProjection,
  };
}

function decideRecovery(input: {
  readonly apply: MutationApplyObservation;
  readonly verificationResult: VerificationResultObservation;
  readonly input: ControlledMutationRecoveryInput;
}): MutationRecoveryDecisionStatus {
  if (input.apply.status === "blocked") return "blocked";
  if (input.apply.status === "failed") return "await_user";
  if (input.verificationResult.status === "failed") {
    return input.input.recovery?.decision ??
      (input.input.recovery?.rollbackAfterVerificationFailure
        ? "rollback_required"
        : "repair_required");
  }
  if (input.verificationResult.status === "passed") return "not_needed";
  return input.input.recovery?.decision ?? "await_user";
}

function verdictStatusFor(input: {
  readonly recoveryDecision: MutationRecoveryDecisionStatus;
  readonly apply: MutationApplyObservation;
  readonly verificationResult: VerificationResultObservation;
  readonly rollback: MutationRollbackObservation;
  readonly repairVerdictTerminalProjection?: RepairVerdictTerminalProjection;
}): MutationRecoveryVerdictStatus {
  if (input.repairVerdictTerminalProjection?.status === "verified_with_repair") {
    return "complete";
  }
  if (input.apply.status === "blocked" || input.recoveryDecision === "blocked") {
    return "blocked";
  }
  if (
    input.apply.status === "failed" ||
    input.verificationResult.status === "failed" ||
    input.rollback.status === "failed" ||
    input.repairVerdictTerminalProjection?.status === "failed"
  ) {
    return "failed";
  }
  if (input.repairVerdictTerminalProjection?.status === "partial") {
    return "incomplete";
  }
  return "not_proven";
}

function applyBlocker(
  authority: MutationAuthorityObservation,
  staleRead: MutationStaleReadObservation,
  snapshot: MutationSnapshotObservation,
): string | undefined {
  if (authority.status !== "granted") return `authority:${authority.status}`;
  if (staleRead.status !== "passed") return `stale-read:${staleRead.status}`;
  if (snapshot.status !== "planned") return `snapshot:${snapshot.status}`;
  return undefined;
}

function repairApplyPostVerificationStatus(
  status: PostRepairVerificationResultObservation["status"] | undefined,
): RepairApplyObservation["postRepairVerificationStatus"] {
  if (status === "passed" || status === "failed" || status === "blocked") {
    return status;
  }
  if (status === "not_run" || status === "selected_not_run" || status === "skipped") {
    return "not_run";
  }
  return "not_proven";
}

function absoluteTargetPath(input: ControlledMutationRecoveryInput): string {
  return path.resolve(input.workspaceRoot, input.target.relativePath);
}

function reasonForAuthority(status: MutationAuthorityStatus): string {
  if (status === "granted") return "explicit mutation authority granted";
  if (status === "permission_pending") return "mutation permission pending";
  if (status === "denied") return "mutation authority denied";
  if (status === "blocked") return "mutation authority blocked";
  return "mutation authority missing";
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze(Array.from(new Set(values)).sort());
}

