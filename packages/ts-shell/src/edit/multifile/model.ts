import path from "node:path";
import { computeFragmentFingerprint } from "../../context/readWindowContinuation.js";
import {
  buildMultiTargetMutationProofInput,
  type MultiTargetMutationProofInput,
} from "../../evidence/projection/mutation/proof.js";
import {
  projectMultiTargetMutationVerdict,
  type MultiTargetMutationTerminalProjection,
} from "../../result/projection/mutation/verdict.js";
import type { ExecutionService } from "../../runtime/execution/service.js";
import {
  observeVerificationResult,
  projectVerificationIntent,
  type VerificationLoopIntent,
  type VerificationResultObservation,
} from "../../verification/result/boundary.js";

export type MultiTargetOperationKind =
  | "read_only"
  | "create"
  | "update"
  | "delete"
  | "move"
  | "unsupported"
  | "unknown";

export type MultiTargetClassificationStatus =
  | MultiTargetOperationKind
  | "authority_required"
  | "blocked";

export type MultiTargetConflictKind =
  | "same_file_overlap"
  | "overlapping_hunk"
  | "stale_base"
  | "missing_file"
  | "path_escape"
  | "unsupported_operation"
  | "dependency_ordering"
  | "snapshot_conflict"
  | "unknown_conflict";

export type MultiTargetAuthorityStatus = "granted" | "missing" | "partial" | "denied" | "blocked";
export type MultiTargetStaleReadStatus = "not_run" | "passed" | "stale" | "target_missing" | "target_exists" | "blocked" | "failed";
export type MultiTargetSnapshotStatus = "not_planned" | "planned" | "unavailable";
export type MultiTargetQueueState =
  | "planned"
  | "ready"
  | "skipped"
  | "blocked"
  | "applying"
  | "applied"
  | "failed"
  | "reverted"
  | "revert_failed"
  | "unknown";
export type MultiTargetGraphRelationKind =
  | "independent"
  | "dependency"
  | "conflict"
  | "blocked";
export type MultiTargetParallelEligibilityStatus =
  | "eligible"
  | "forced_sequential"
  | "blocked"
  | "unsupported"
  | "unknown"
  | "authority_required"
  | "stale"
  | "conflict"
  | "dependency_blocked"
  | "snapshot_missing"
  | "rollback_missing"
  | "unsafe";
export type MultiTargetGroupMode = "parallel" | "sequential" | "blocked";
export type MultiTargetGroupStatus =
  | "created"
  | "ready"
  | "applying"
  | "settled"
  | "failed"
  | "skipped"
  | "blocked";
export type MultiTargetSettlementStatus =
  | "applied"
  | "failed"
  | "skipped"
  | "reverted"
  | "revert_failed";
export type MultiTargetVerificationStatus = VerificationResultObservation["status"];
export type MultiTargetRepairEligibilityStatus = "eligible" | "not_eligible" | "not_needed" | "blocked";
export type MultiTargetVerdictStatus = "complete" | "blocked" | "failed" | "partial" | "not_proven";

export interface MultiTargetMutationTargetInput {
  readonly targetId: string;
  readonly relativePath: string;
  readonly operation: MultiTargetOperationKind;
  readonly expectedContent?: string;
  readonly proposedContent?: string;
  readonly repairContent?: string;
  readonly reportSafeTargetSummary?: string;
  readonly dependsOnTargetIds?: readonly string[];
  readonly hunk?: {
    readonly startLine: number;
    readonly endLine: number;
  };
  readonly authority?: {
    readonly status: Exclude<MultiTargetAuthorityStatus, "partial">;
    readonly reason?: string;
  };
  readonly snapshot?: {
    readonly available: boolean;
    readonly reason?: string;
  };
  readonly verification?: {
    readonly status: MultiTargetVerificationStatus;
    readonly failureClass?: string;
  };
}

export interface MultiTargetMutationInput {
  readonly laneId: string;
  readonly turnId: string;
  readonly workspaceRoot: string;
  readonly executionService: Pick<ExecutionService, "readTextFile" | "writeTextFile">;
  readonly targets: readonly MultiTargetMutationTargetInput[];
  readonly authority: {
    readonly status: MultiTargetAuthorityStatus;
    readonly reason?: string;
  };
  readonly parallel?: {
    readonly enabled?: boolean;
    readonly maxGroupSize?: number;
  };
  readonly verification: {
    readonly wholeTaskStatus: MultiTargetVerificationStatus;
    readonly failureClass?: string;
  };
  readonly recovery?: {
    readonly rollbackOnPartialFailure?: boolean;
    readonly repairTargetIds?: readonly string[];
    readonly postRepairWholeTaskStatus?: MultiTargetVerificationStatus;
  };
  readonly notProvenClaims?: readonly string[];
}

export interface MultiTargetMutationPlan {
  readonly planId: string;
  readonly targetCount: number;
  readonly operationKinds: readonly MultiTargetOperationKind[];
  readonly parallelMutation: "unsupported" | "bounded";
  readonly ordering: "sequential" | "bounded_parallel";
  readonly maxGroupSize: number;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetClassification {
  readonly targetId: string;
  readonly targetSummary: string;
  readonly operation: MultiTargetOperationKind;
  readonly status: MultiTargetClassificationStatus;
  readonly reason: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetConflict {
  readonly conflictId: string;
  readonly kind: MultiTargetConflictKind;
  readonly targetIds: readonly string[];
  readonly blocked: boolean;
  readonly reason: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetAuthorityObservation {
  readonly authorityId: string;
  readonly status: MultiTargetAuthorityStatus;
  readonly targetStatuses: readonly {
    readonly targetId: string;
    readonly status: Exclude<MultiTargetAuthorityStatus, "partial">;
    readonly reason: string;
  }[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetStaleReadObservation {
  readonly staleReadId: string;
  readonly targetId: string;
  readonly status: MultiTargetStaleReadStatus;
  readonly targetSummary: string;
  readonly expectedFingerprint?: string;
  readonly currentFingerprint?: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetSnapshotObservation {
  readonly snapshotId: string;
  readonly targetId: string;
  readonly status: MultiTargetSnapshotStatus;
  readonly restorePlanAvailable: boolean;
  readonly targetSummary: string;
  readonly contentFingerprint?: string;
  readonly blocker?: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetQueueObservation {
  readonly queueId: string;
  readonly targetId: string;
  readonly state: MultiTargetQueueState;
  readonly targetSummary: string;
  readonly order: number;
  readonly blocker?: string;
  readonly contentFingerprint?: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetGraphNode {
  readonly nodeId: string;
  readonly targetId: string;
  readonly targetSummary: string;
  readonly operation: MultiTargetOperationKind;
  readonly relation: MultiTargetGraphRelationKind;
  readonly conflictIds: readonly string[];
  readonly dependsOnTargetIds: readonly string[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetParallelEligibility {
  readonly eligibilityId: string;
  readonly targetId: string;
  readonly status: MultiTargetParallelEligibilityStatus;
  readonly reason: string;
  readonly groupable: boolean;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetExecutionGroup {
  readonly groupId: string;
  readonly mode: MultiTargetGroupMode;
  readonly status: MultiTargetGroupStatus;
  readonly targetIds: readonly string[];
  readonly order: number;
  readonly maxGroupSize: number;
  readonly blockedReason?: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetSettlementObservation {
  readonly settlementId: string;
  readonly groupId: string;
  readonly targetId: string;
  readonly status: MultiTargetSettlementStatus;
  readonly order: number;
  readonly targetSummary: string;
  readonly originalFailure?: string;
  readonly contentFingerprint?: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetRollbackObservation {
  readonly rollbackId: string;
  readonly status: "not_required" | "required" | "succeeded" | "failed";
  readonly targetIds: readonly string[];
  readonly revertedTargetIds: readonly string[];
  readonly failedTargetIds: readonly string[];
  readonly preservesOriginalFailure: true;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetRepairEligibility {
  readonly eligibilityId: string;
  readonly status: MultiTargetRepairEligibilityStatus;
  readonly targetIds: readonly string[];
  readonly originalFailureIds: readonly string[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface MultiTargetMutationProjection {
  readonly laneId: string;
  readonly turnId: string;
  readonly plan: MultiTargetMutationPlan;
  readonly classifications: readonly MultiTargetClassification[];
  readonly conflicts: readonly MultiTargetConflict[];
  readonly authority: MultiTargetAuthorityObservation;
  readonly staleReads: readonly MultiTargetStaleReadObservation[];
  readonly snapshots: readonly MultiTargetSnapshotObservation[];
  readonly graph: readonly MultiTargetGraphNode[];
  readonly parallelEligibility: readonly MultiTargetParallelEligibility[];
  readonly executionGroups: readonly MultiTargetExecutionGroup[];
  readonly queue: readonly MultiTargetQueueObservation[];
  readonly settlements: readonly MultiTargetSettlementObservation[];
  readonly rollback: MultiTargetRollbackObservation;
  readonly verificationIntents: readonly VerificationLoopIntent[];
  readonly verificationResults: readonly VerificationResultObservation[];
  readonly groupVerificationIntents: readonly VerificationLoopIntent[];
  readonly groupVerificationResults: readonly VerificationResultObservation[];
  readonly wholeTaskVerificationIntent: VerificationLoopIntent;
  readonly wholeTaskVerificationResult: VerificationResultObservation;
  readonly repairEligibility: MultiTargetRepairEligibility;
  readonly proofInput: MultiTargetMutationProofInput;
  readonly resultVerdict: MultiTargetMutationTerminalProjection;
  readonly verdictStatus: MultiTargetVerdictStatus;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export async function runControlledMultiTargetMutation(
  input: MultiTargetMutationInput,
): Promise<MultiTargetMutationProjection> {
  const laneId = sanitizeId(input.laneId);
  const notProvenClaims = unique([
    "terminal-success",
    "task-success",
    "multi-target-plan-is-not-success",
    "target-classification-is-not-success",
    "conflict-pass-is-not-success",
    "authority-is-not-success",
    "stale-read-is-not-success",
    "snapshot-is-not-success",
    "apply-queue-is-not-success",
    "parallel-eligibility-is-not-success",
    "bounded-group-is-not-success",
    "settlement-is-not-success",
    "target-apply-is-not-success",
    "group-apply-is-not-success",
    "rollback-is-not-success",
    "verification-required-for-success",
    "result-verdict-required-for-success",
    "uncontrolled-parallel-mutation-unsupported",
    "raw-edit-content-excluded",
    ...(input.notProvenClaims ?? []),
  ]);
  const plan = createPlan({ laneId, input, notProvenClaims });
  const classifications = input.targets.map((target) =>
    classifyTarget({ laneId, workspaceRoot: input.workspaceRoot, target, notProvenClaims })
  );
  const conflicts = detectConflicts({ laneId, input, classifications, notProvenClaims });
  const authority = observeAuthority({ laneId, input, classifications, notProvenClaims });
  const staleReads: MultiTargetStaleReadObservation[] = [];
  const snapshots: MultiTargetSnapshotObservation[] = [];
  const queue: MultiTargetQueueObservation[] = [];
  for (const [index, target] of input.targets.entries()) {
    const classification = classifications[index]!;
    const targetConflicts = conflicts.filter((conflict) =>
      conflict.targetIds.includes(target.targetId) && conflict.blocked
    );
    const staleRead = await observeStaleRead({
      laneId,
      input,
      target,
      classification,
      targetAuthority: authority.targetStatuses[index],
      targetConflicts,
      notProvenClaims,
    });
    staleReads.push(staleRead);
    const snapshot = observeSnapshot({
      laneId,
      target,
      staleRead,
      targetConflicts,
      notProvenClaims,
    });
    snapshots.push(snapshot);
    queue.push(queueObservation({
      laneId,
      target,
      state: initialQueueState({
        classification,
        targetAuthority: authority.targetStatuses[index],
        targetConflicts,
        staleRead,
        snapshot,
      }),
      order: index,
      targetSummary: staleRead.targetSummary,
      blocker: queueBlocker({
        classification,
        targetAuthority: authority.targetStatuses[index],
        targetConflicts,
        staleRead,
        snapshot,
      }),
      notProvenClaims,
    }));
  }
  const graph = buildGraph({
    laneId,
    input,
    classifications,
    conflicts,
    notProvenClaims,
  });
  const parallelEligibility = buildParallelEligibility({
    laneId,
    input,
    classifications,
    conflicts,
    authority,
    staleReads,
    snapshots,
    queue,
    notProvenClaims,
  });
  const executionGroups = createExecutionGroups({
    laneId,
    input,
    queue,
    parallelEligibility,
    maxGroupSize: plan.maxGroupSize,
    notProvenClaims,
  });
  const settlements: MultiTargetSettlementObservation[] = [];
  const appliedTargets = await applyExecutionGroups({
    laneId,
    input,
    queue,
    executionGroups,
    settlements,
    notProvenClaims,
  });

  const partialFailure = queue.some((item) => item.state === "failed") && appliedTargets.length > 0;
  const rollback = await observeRollback({
    laneId,
    input,
    appliedTargets,
    required: partialFailure && input.recovery?.rollbackOnPartialFailure !== false,
    notProvenClaims,
  });
  for (const targetId of rollback.revertedTargetIds) {
    const target = input.targets.find((item) => item.targetId === targetId)!;
    const targetSummary = sanitizeTargetSummary(target.reportSafeTargetSummary ?? target.relativePath);
    queue.push(queueObservation({
      laneId,
      target,
      state: "reverted",
      order: queue.length,
      targetSummary,
      notProvenClaims,
    }));
    settlements.push(settlementObservation({
      laneId,
      groupId: rollback.rollbackId,
      target,
      status: "reverted",
      order: settlements.length,
      targetSummary,
      notProvenClaims,
    }));
  }
  for (const targetId of rollback.failedTargetIds) {
    const target = input.targets.find((item) => item.targetId === targetId)!;
    const targetSummary = sanitizeTargetSummary(target.reportSafeTargetSummary ?? target.relativePath);
    queue.push(queueObservation({
      laneId,
      target,
      state: "revert_failed",
      order: queue.length,
      targetSummary,
      notProvenClaims,
    }));
    settlements.push(settlementObservation({
      laneId,
      groupId: rollback.rollbackId,
      target,
      status: "revert_failed",
      order: settlements.length,
      targetSummary,
      originalFailure: "rollback-failed",
      notProvenClaims,
    }));
  }

  const verificationIntents = input.targets.map((target) =>
    projectVerificationIntent({
      sourceTurnId: input.turnId,
      targetSummary: `verify mutation target ${sanitizeTargetSummary(target.reportSafeTargetSummary ?? target.relativePath)}`,
      verificationKind: "owner_projection",
      authorityRequirement: "granted",
      dispatchStatus: targetReachedState(queue, target.targetId, "applied") ? "dispatched" : "blocked",
      relevanceStatus: "task_relevant",
      coverageStatus: "covered",
      notProvenClaims,
    })
  );
  const verificationResults = verificationIntents.map((intent, index) => {
    const target = input.targets[index]!;
    const applied = targetReachedState(queue, target.targetId, "applied");
    return observeVerificationResult({
      intent,
      status: applied ? target.verification?.status ?? "not_run" : "blocked",
      failureClass: applied
        ? target.verification?.failureClass
        : "target-apply-not-complete",
      repairEligible: Boolean(input.recovery?.repairTargetIds?.includes(target.targetId)),
      runtimeReceiptIds: applied ? [`${laneId}:target:${target.targetId}:verification`] : [],
      safeSummary: applied
        ? `target verification ${target.verification?.status ?? "not_run"}`
        : "target did not reach verification",
      notProvenClaims,
    });
  });
  const groupVerificationIntents = executionGroups
    .filter((group) => group.mode !== "blocked")
    .map((group) =>
      projectVerificationIntent({
        sourceTurnId: input.turnId,
        targetSummary: `verify mutation group ${sanitizeTargetSummary(group.groupId)}`,
        verificationKind: "owner_projection",
        authorityRequirement: "granted",
        dispatchStatus: groupTargetsApplied(queue, group) ? "dispatched" : "blocked",
        relevanceStatus: "task_relevant",
        coverageStatus: "covered",
        notProvenClaims,
      })
    );
  const groupVerificationResults = groupVerificationIntents.map((intent, index) => {
    const group = executionGroups.filter((item) => item.mode !== "blocked")[index]!;
    const applied = groupTargetsApplied(queue, group);
    const groupTargetStatuses = group.targetIds.map((targetId) =>
      verificationResults.find((item, targetIndex) =>
        sanitizeId(input.targets[targetIndex]!.targetId) === targetId
      )?.status ?? "blocked"
    );
    const failed = groupTargetStatuses.some((status) => status === "failed");
    return observeVerificationResult({
      intent,
      status: applied ? failed ? "failed" : "passed" : "blocked",
      failureClass: applied
        ? failed ? "group-target-verification-failed" : undefined
        : "group-apply-not-complete",
      repairEligible: group.targetIds.some((targetId) =>
        input.recovery?.repairTargetIds?.map(sanitizeId).includes(targetId)
      ),
      runtimeReceiptIds: applied ? [`${laneId}:group:${group.order}:verification`] : [],
      safeSummary: applied
        ? failed ? "group verification failed" : "group verification passed"
        : "group did not reach verification",
      notProvenClaims,
    });
  });
  const wholeTaskVerificationIntent = projectVerificationIntent({
    sourceTurnId: input.turnId,
    targetSummary: `verify multi-target mutation lane ${laneId}`,
    verificationKind: "owner_projection",
    authorityRequirement: "granted",
    dispatchStatus: allReadyTargetsApplied(queue, input.targets) ? "dispatched" : "blocked",
    relevanceStatus: "task_relevant",
    coverageStatus: "covered",
    notProvenClaims,
  });
  const wholeTaskVerificationResult = observeVerificationResult({
    intent: wholeTaskVerificationIntent,
    status: allReadyTargetsApplied(queue, input.targets)
      ? input.verification.wholeTaskStatus
      : "blocked",
    failureClass: allReadyTargetsApplied(queue, input.targets)
      ? input.verification.failureClass
      : "multi-target-apply-not-complete",
    repairEligible: (input.recovery?.repairTargetIds?.length ?? 0) > 0,
    runtimeReceiptIds: allReadyTargetsApplied(queue, input.targets)
      ? [`${laneId}:whole-task-verification`]
      : [],
    safeSummary: allReadyTargetsApplied(queue, input.targets)
      ? `whole task verification ${input.verification.wholeTaskStatus}`
      : "whole task verification blocked",
    notProvenClaims,
  });
  const repairEligibility = observeRepairEligibility({
    laneId,
    verificationResults,
    wholeTaskVerificationResult,
    repairTargetIds: input.recovery?.repairTargetIds ?? [],
    notProvenClaims,
  });
  const proofInput = buildMultiTargetMutationProofInput({
    laneId,
    targetCount: input.targets.length,
    appliedCount: countState(queue, "applied"),
    failedCount: countState(queue, "failed"),
    revertedCount: countState(queue, "reverted"),
    blockedCount: countState(queue, "blocked") + countState(queue, "skipped"),
    perTargetVerificationPassed: verificationResults.every((item) => item.status === "passed") ||
      input.recovery?.postRepairWholeTaskStatus === "passed",
    perGroupVerificationPassed: groupVerificationResults.every((item) => item.status === "passed") ||
      input.recovery?.postRepairWholeTaskStatus === "passed",
    wholeTaskVerificationPassed:
      wholeTaskVerificationResult.status === "passed" ||
      input.recovery?.postRepairWholeTaskStatus === "passed",
    boundedGroupProof: input.parallel?.enabled
      ? executionGroups.some((item) => item.mode === "parallel") &&
        executionGroups.every((item) => item.mode !== "parallel" || item.targetIds.length <= item.maxGroupSize)
      : true,
    deterministicSettlementProof: deterministicSettlementOrder({ input, settlements }),
    repairSatisfied:
      repairEligibility.status === "not_needed" ||
      input.recovery?.postRepairWholeTaskStatus === "passed",
    notProvenClaims,
  });
  const resultVerdict = projectMultiTargetMutationVerdict({ proofInput, notProvenClaims });
  return deepFreeze({
    laneId,
    turnId: sanitizeText(input.turnId, 180),
    plan,
    classifications,
    conflicts,
    authority,
    staleReads,
    snapshots,
    graph,
    parallelEligibility,
    executionGroups,
    queue,
    settlements,
    rollback,
    verificationIntents,
    verificationResults,
    groupVerificationIntents,
    groupVerificationResults,
    wholeTaskVerificationIntent,
    wholeTaskVerificationResult,
    repairEligibility,
    proofInput,
    resultVerdict,
    verdictStatus: resultVerdict.status,
    redactionStatus: "report-safe",
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      ...notProvenClaims,
      ...plan.notProvenClaims,
      ...classifications.flatMap((item) => item.notProvenClaims),
      ...conflicts.flatMap((item) => item.notProvenClaims),
      ...authority.notProvenClaims,
      ...staleReads.flatMap((item) => item.notProvenClaims),
      ...snapshots.flatMap((item) => item.notProvenClaims),
      ...graph.flatMap((item) => item.notProvenClaims),
      ...parallelEligibility.flatMap((item) => item.notProvenClaims),
      ...executionGroups.flatMap((item) => item.notProvenClaims),
      ...queue.flatMap((item) => item.notProvenClaims),
      ...settlements.flatMap((item) => item.notProvenClaims),
      ...rollback.notProvenClaims,
      ...verificationResults.flatMap((item) => item.notProvenClaims),
      ...groupVerificationResults.flatMap((item) => item.notProvenClaims),
      ...wholeTaskVerificationResult.notProvenClaims,
      ...repairEligibility.notProvenClaims,
      ...proofInput.notProvenClaims,
      ...resultVerdict.notProvenClaims,
    ]),
  });
}

function createPlan(input: {
  readonly laneId: string;
  readonly input: MultiTargetMutationInput;
  readonly notProvenClaims: readonly string[];
}): MultiTargetMutationPlan {
  return deepFreeze({
    planId: `${input.laneId}:plan`,
    targetCount: input.input.targets.length,
    operationKinds: unique(input.input.targets.map((target) => target.operation)),
    parallelMutation: input.input.parallel?.enabled ? "bounded" : "unsupported",
    ordering: input.input.parallel?.enabled ? "bounded_parallel" : "sequential",
    maxGroupSize: boundedGroupSize(input.input.parallel?.maxGroupSize),
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "plan-created-is-not-success",
      input.input.parallel?.enabled
        ? "bounded-parallel-plan-is-not-success"
        : "parallel-mutation-unsupported-without-conflict-authority-rollback-proof",
      ...input.notProvenClaims,
    ]),
  });
}

function classifyTarget(input: {
  readonly laneId: string;
  readonly workspaceRoot: string;
  readonly target: MultiTargetMutationTargetInput;
  readonly notProvenClaims: readonly string[];
}): MultiTargetClassification {
  const escaped = pathEscapes(input.workspaceRoot, input.target.relativePath);
  const operation = input.target.operation;
  const status: MultiTargetClassificationStatus = escaped
    ? "blocked"
    : operation === "delete" || operation === "move" || operation === "unsupported" ||
        operation === "unknown"
      ? operation
      : input.target.authority?.status === "missing"
        ? "authority_required"
        : operation;
  const reason = escaped
    ? "target path escapes workspace"
    : operation === "delete" || operation === "move" || operation === "unsupported" ||
        operation === "unknown"
      ? "operation not supported by sanctioned multi-target writer"
      : status === "authority_required"
        ? "target authority missing"
        : "target classified";
  return deepFreeze({
    targetId: sanitizeId(input.target.targetId),
    targetSummary: sanitizeTargetSummary(
      input.target.reportSafeTargetSummary ?? input.target.relativePath,
    ),
    operation,
    status,
    reason,
    terminalSuccessClaim: false,
    notProvenClaims: unique(["classification-is-not-success", ...input.notProvenClaims]),
  });
}

function detectConflicts(input: {
  readonly laneId: string;
  readonly input: MultiTargetMutationInput;
  readonly classifications: readonly MultiTargetClassification[];
  readonly notProvenClaims: readonly string[];
}): readonly MultiTargetConflict[] {
  const conflicts: MultiTargetConflict[] = [];
  for (const [index, target] of input.input.targets.entries()) {
    const classification = input.classifications[index]!;
    if (classification.status === "blocked") {
      conflicts.push(conflict({
        laneId: input.laneId,
        kind: "path_escape",
        targetIds: [target.targetId],
        reason: classification.reason,
        notProvenClaims: input.notProvenClaims,
      }));
    }
    if (
      target.operation === "delete" || target.operation === "move" ||
      target.operation === "unsupported" || target.operation === "unknown"
    ) {
      conflicts.push(conflict({
        laneId: input.laneId,
        kind: "unsupported_operation",
        targetIds: [target.targetId],
        reason: `operation ${target.operation} is not supported`,
        notProvenClaims: input.notProvenClaims,
      }));
    }
    if (target.expectedContent === undefined && target.operation === "update") {
      conflicts.push(conflict({
        laneId: input.laneId,
        kind: "stale_base",
        targetIds: [target.targetId],
        reason: "update target missing expected base content",
        notProvenClaims: input.notProvenClaims,
      }));
    }
  }
  for (let leftIndex = 0; leftIndex < input.input.targets.length; leftIndex += 1) {
    const left = input.input.targets[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < input.input.targets.length; rightIndex += 1) {
      const right = input.input.targets[rightIndex]!;
      if (normalizedPath(left.relativePath) !== normalizedPath(right.relativePath)) {
        continue;
      }
      conflicts.push(conflict({
        laneId: input.laneId,
        kind: "same_file_overlap",
        targetIds: [left.targetId, right.targetId],
        reason: "same file has multiple target operations in the same lane",
        notProvenClaims: input.notProvenClaims,
      }));
      if (left.hunk && right.hunk && rangesOverlap(left.hunk, right.hunk)) {
        conflicts.push(conflict({
          laneId: input.laneId,
          kind: "overlapping_hunk",
          targetIds: [left.targetId, right.targetId],
          reason: "target hunks overlap",
          notProvenClaims: input.notProvenClaims,
        }));
      }
    }
  }
  for (const target of input.input.targets) {
    for (const dependencyId of target.dependsOnTargetIds ?? []) {
      const dependency = input.input.targets.find((item) => item.targetId === dependencyId);
      if (!dependency) {
        conflicts.push(conflict({
          laneId: input.laneId,
          kind: "dependency_ordering",
          targetIds: [target.targetId, dependencyId],
          reason: "target dependency is missing",
          notProvenClaims: input.notProvenClaims,
        }));
      }
    }
  }
  return deepFreeze(conflicts);
}

function conflict(input: {
  readonly laneId: string;
  readonly kind: MultiTargetConflictKind;
  readonly targetIds: readonly string[];
  readonly reason: string;
  readonly notProvenClaims: readonly string[];
}): MultiTargetConflict {
  return deepFreeze({
    conflictId: `${input.laneId}:conflict:${input.kind}:${input.targetIds.map(sanitizeId).join("+")}`,
    kind: input.kind,
    targetIds: input.targetIds.map(sanitizeId),
    blocked: true,
    reason: sanitizeText(input.reason, 180),
    terminalSuccessClaim: false,
    notProvenClaims: unique(["conflict-check-is-not-success", ...input.notProvenClaims]),
  });
}

function observeAuthority(input: {
  readonly laneId: string;
  readonly input: MultiTargetMutationInput;
  readonly classifications: readonly MultiTargetClassification[];
  readonly notProvenClaims: readonly string[];
}): MultiTargetAuthorityObservation {
  const targetStatuses = input.input.targets.map((target, index) => {
    const status = input.input.authority.status === "granted"
      ? target.authority?.status ?? "granted"
      : input.input.authority.status === "partial"
        ? target.authority?.status ?? "missing"
        : input.input.authority.status;
    return {
      targetId: sanitizeId(target.targetId),
      status: status as Exclude<MultiTargetAuthorityStatus, "partial">,
      reason: sanitizeText(
        target.authority?.reason ?? input.input.authority.reason ??
          (status === "granted" ? "explicit multi-target authority granted" : "mutation authority unavailable"),
        180,
      ),
    };
  });
  const blockedByClassification = input.classifications.some((item) =>
    item.status === "authority_required" || item.status === "blocked"
  );
  const status = blockedByClassification
    ? "blocked"
    : input.input.authority.status === "partial" ||
        targetStatuses.some((item) => item.status !== "granted")
      ? "partial"
      : input.input.authority.status;
  return deepFreeze({
    authorityId: `${input.laneId}:authority`,
    status,
    targetStatuses,
    terminalSuccessClaim: false,
    notProvenClaims: unique(["authority-is-not-success", ...input.notProvenClaims]),
  });
}

async function observeStaleRead(input: {
  readonly laneId: string;
  readonly input: MultiTargetMutationInput;
  readonly target: MultiTargetMutationTargetInput;
  readonly classification: MultiTargetClassification;
  readonly targetAuthority?: MultiTargetAuthorityObservation["targetStatuses"][number];
  readonly targetConflicts: readonly MultiTargetConflict[];
  readonly notProvenClaims: readonly string[];
}): Promise<MultiTargetStaleReadObservation> {
  const targetSummary = sanitizeTargetSummary(
    input.target.reportSafeTargetSummary ?? input.target.relativePath,
  );
  const expectedFingerprint = input.target.expectedContent !== undefined
    ? fingerprint(input.target.expectedContent)
    : undefined;
  if (
    input.classification.status === "blocked" ||
    input.targetConflicts.length > 0 ||
    input.targetAuthority?.status !== "granted"
  ) {
    return deepFreeze({
      staleReadId: `${input.laneId}:stale-read:${sanitizeId(input.target.targetId)}`,
      targetId: sanitizeId(input.target.targetId),
      status: "blocked",
      targetSummary,
      ...(expectedFingerprint ? { expectedFingerprint } : {}),
      terminalSuccessClaim: false,
      notProvenClaims: unique(["stale-read-blocked-is-not-success", ...input.notProvenClaims]),
    });
  }
  try {
    const current = await input.input.executionService.readTextFile({
      operationKind: "file.read",
      absolutePath: absoluteTargetPath(input.input.workspaceRoot, input.target.relativePath),
      workspaceRoot: input.input.workspaceRoot,
      authority: {
        mode: "approved-for-write",
        source: "workspace-authority",
        reason: "final stale-read before controlled multi-target mutation",
      },
      caller: "edit-multifile",
      reason: "final stale-read before controlled multi-target mutation",
      reportSafeTarget: targetSummary,
    });
    const currentFingerprint = fingerprint(current);
    if (input.target.operation === "create") {
      return deepFreeze({
        staleReadId: `${input.laneId}:stale-read:${sanitizeId(input.target.targetId)}`,
        targetId: sanitizeId(input.target.targetId),
        status: "target_exists",
        targetSummary,
        currentFingerprint,
        terminalSuccessClaim: false,
        notProvenClaims: unique(["create-target-exists-is-not-success", ...input.notProvenClaims]),
      });
    }
    return deepFreeze({
      staleReadId: `${input.laneId}:stale-read:${sanitizeId(input.target.targetId)}`,
      targetId: sanitizeId(input.target.targetId),
      status: current === input.target.expectedContent ? "passed" : "stale",
      targetSummary,
      ...(expectedFingerprint ? { expectedFingerprint } : {}),
      currentFingerprint,
      terminalSuccessClaim: false,
      notProvenClaims: unique(["stale-read-passed-is-not-success", ...input.notProvenClaims]),
    });
  } catch {
    const status = input.target.operation === "create" ? "passed" : "target_missing";
    return deepFreeze({
      staleReadId: `${input.laneId}:stale-read:${sanitizeId(input.target.targetId)}`,
      targetId: sanitizeId(input.target.targetId),
      status,
      targetSummary,
      ...(expectedFingerprint ? { expectedFingerprint } : {}),
      terminalSuccessClaim: false,
      notProvenClaims: unique([
        status === "passed" ? "create-missing-target-is-not-success" : "missing-file-is-not-success",
        ...input.notProvenClaims,
      ]),
    });
  }
}

function observeSnapshot(input: {
  readonly laneId: string;
  readonly target: MultiTargetMutationTargetInput;
  readonly staleRead: MultiTargetStaleReadObservation;
  readonly targetConflicts: readonly MultiTargetConflict[];
  readonly notProvenClaims: readonly string[];
}): MultiTargetSnapshotObservation {
  const targetSummary = sanitizeTargetSummary(
    input.target.reportSafeTargetSummary ?? input.target.relativePath,
  );
  if (input.staleRead.status !== "passed" || input.targetConflicts.length > 0) {
    return deepFreeze({
      snapshotId: `${input.laneId}:snapshot:${sanitizeId(input.target.targetId)}`,
      targetId: sanitizeId(input.target.targetId),
      status: "not_planned",
      restorePlanAvailable: false,
      targetSummary,
      blocker: input.targetConflicts[0]?.kind ?? `stale-read:${input.staleRead.status}`,
      terminalSuccessClaim: false,
      notProvenClaims: unique(["snapshot-not-planned-is-not-success", ...input.notProvenClaims]),
    });
  }
  if (input.target.snapshot?.available === false) {
    return deepFreeze({
      snapshotId: `${input.laneId}:snapshot:${sanitizeId(input.target.targetId)}`,
      targetId: sanitizeId(input.target.targetId),
      status: "unavailable",
      restorePlanAvailable: false,
      targetSummary,
      blocker: sanitizeText(input.target.snapshot.reason ?? "snapshot unavailable", 160),
      terminalSuccessClaim: false,
      notProvenClaims: unique(["snapshot-unavailable-is-not-success", ...input.notProvenClaims]),
    });
  }
  return deepFreeze({
    snapshotId: `${input.laneId}:snapshot:${sanitizeId(input.target.targetId)}`,
    targetId: sanitizeId(input.target.targetId),
    status: "planned",
    restorePlanAvailable: true,
    targetSummary,
    contentFingerprint: fingerprint(input.target.expectedContent ?? ""),
    terminalSuccessClaim: false,
    notProvenClaims: unique(["snapshot-planned-is-not-success", ...input.notProvenClaims]),
  });
}

function initialQueueState(input: {
  readonly classification: MultiTargetClassification;
  readonly targetAuthority?: MultiTargetAuthorityObservation["targetStatuses"][number];
  readonly targetConflicts: readonly MultiTargetConflict[];
  readonly staleRead: MultiTargetStaleReadObservation;
  readonly snapshot: MultiTargetSnapshotObservation;
}): MultiTargetQueueState {
  if (input.targetConflicts.some((item) => item.kind === "dependency_ordering")) return "skipped";
  if (
    input.classification.status === "blocked" ||
    input.classification.status === "authority_required" ||
    input.targetAuthority?.status !== "granted" ||
    input.targetConflicts.length > 0 ||
    input.staleRead.status !== "passed" ||
    input.snapshot.status !== "planned"
  ) {
    return "blocked";
  }
  if (
    input.classification.operation === "delete" ||
    input.classification.operation === "move" ||
    input.classification.operation === "unsupported" ||
    input.classification.operation === "unknown" ||
    input.classification.operation === "read_only"
  ) {
    return "blocked";
  }
  return "ready";
}

function queueBlocker(input: {
  readonly classification: MultiTargetClassification;
  readonly targetAuthority?: MultiTargetAuthorityObservation["targetStatuses"][number];
  readonly targetConflicts: readonly MultiTargetConflict[];
  readonly staleRead: MultiTargetStaleReadObservation;
  readonly snapshot: MultiTargetSnapshotObservation;
}): string | undefined {
  if (input.targetConflicts[0]) return input.targetConflicts[0].kind;
  if (input.targetAuthority?.status !== "granted") return `authority:${input.targetAuthority?.status ?? "missing"}`;
  if (input.staleRead.status !== "passed") return `stale-read:${input.staleRead.status}`;
  if (input.snapshot.status !== "planned") return `snapshot:${input.snapshot.status}`;
  if (input.classification.status !== input.classification.operation) return input.classification.status;
  if (
    input.classification.operation === "delete" || input.classification.operation === "move" ||
    input.classification.operation === "unsupported" || input.classification.operation === "unknown" ||
    input.classification.operation === "read_only"
  ) {
    return `operation:${input.classification.operation}`;
  }
  return undefined;
}

function queueObservation(input: {
  readonly laneId: string;
  readonly target: MultiTargetMutationTargetInput;
  readonly state: MultiTargetQueueState;
  readonly targetSummary: string;
  readonly order: number;
  readonly blocker?: string;
  readonly contentFingerprint?: string;
  readonly notProvenClaims: readonly string[];
}): MultiTargetQueueObservation {
  return deepFreeze({
    queueId: `${input.laneId}:queue:${sanitizeId(input.target.targetId)}:${input.order}`,
    targetId: sanitizeId(input.target.targetId),
    state: input.state,
    targetSummary: input.targetSummary,
    order: input.order,
    ...(input.blocker ? { blocker: sanitizeText(input.blocker, 160) } : {}),
    ...(input.contentFingerprint ? { contentFingerprint: input.contentFingerprint } : {}),
    terminalSuccessClaim: false,
    notProvenClaims: unique([`queue-${input.state}-is-not-success`, ...input.notProvenClaims]),
  });
}

function buildGraph(input: {
  readonly laneId: string;
  readonly input: MultiTargetMutationInput;
  readonly classifications: readonly MultiTargetClassification[];
  readonly conflicts: readonly MultiTargetConflict[];
  readonly notProvenClaims: readonly string[];
}): readonly MultiTargetGraphNode[] {
  return deepFreeze(input.input.targets.map((target, index) => {
    const targetId = sanitizeId(target.targetId);
    const targetConflicts = input.conflicts.filter((item) => item.targetIds.includes(targetId));
    const classification = input.classifications[index]!;
    const dependsOnTargetIds = (target.dependsOnTargetIds ?? []).map(sanitizeId);
    const relation: MultiTargetGraphRelationKind = targetConflicts.length > 0
      ? targetConflicts.some((item) => item.kind === "dependency_ordering")
        ? "blocked"
        : "conflict"
      : dependsOnTargetIds.length > 0
        ? "dependency"
        : "independent";
    return {
      nodeId: `${input.laneId}:graph:${targetId}`,
      targetId,
      targetSummary: sanitizeTargetSummary(target.reportSafeTargetSummary ?? target.relativePath),
      operation: classification.operation,
      relation,
      conflictIds: targetConflicts.map((item) => item.conflictId),
      dependsOnTargetIds,
      terminalSuccessClaim: false,
      notProvenClaims: unique(["mutation-graph-is-not-success", ...input.notProvenClaims]),
    };
  }));
}

function buildParallelEligibility(input: {
  readonly laneId: string;
  readonly input: MultiTargetMutationInput;
  readonly classifications: readonly MultiTargetClassification[];
  readonly conflicts: readonly MultiTargetConflict[];
  readonly authority: MultiTargetAuthorityObservation;
  readonly staleReads: readonly MultiTargetStaleReadObservation[];
  readonly snapshots: readonly MultiTargetSnapshotObservation[];
  readonly queue: readonly MultiTargetQueueObservation[];
  readonly notProvenClaims: readonly string[];
}): readonly MultiTargetParallelEligibility[] {
  return deepFreeze(input.input.targets.map((target, index) => {
    const targetId = sanitizeId(target.targetId);
    const classification = input.classifications[index]!;
    const targetAuthority = input.authority.targetStatuses[index];
    const staleRead = input.staleReads[index]!;
    const snapshot = input.snapshots[index]!;
    const queueEntry = latestQueueEntry(input.queue, targetId);
    const targetConflicts = input.conflicts.filter((item) => item.targetIds.includes(targetId));
    const status = parallelEligibilityStatus({
      target,
      classification,
      targetAuthority,
      staleRead,
      snapshot,
      queueEntry,
      targetConflicts,
    });
    const groupable = input.input.parallel?.enabled === true && status === "eligible";
    return {
      eligibilityId: `${input.laneId}:eligibility:${targetId}`,
      targetId,
      status,
      reason: parallelEligibilityReason(status, targetConflicts, staleRead, snapshot, targetAuthority),
      groupable,
      terminalSuccessClaim: false,
      notProvenClaims: unique([
        `parallel-eligibility-${status}-is-not-success`,
        ...input.notProvenClaims,
      ]),
    };
  }));
}

function createExecutionGroups(input: {
  readonly laneId: string;
  readonly input: MultiTargetMutationInput;
  readonly queue: readonly MultiTargetQueueObservation[];
  readonly parallelEligibility: readonly MultiTargetParallelEligibility[];
  readonly maxGroupSize: number;
  readonly notProvenClaims: readonly string[];
}): readonly MultiTargetExecutionGroup[] {
  const groups: MultiTargetExecutionGroup[] = [];
  const readyTargets = input.input.targets.filter((target) =>
    latestQueueEntry(input.queue, target.targetId)?.state === "ready"
  );
  if (!input.input.parallel?.enabled) {
    for (const target of readyTargets) {
      groups.push(executionGroup({
        laneId: input.laneId,
        mode: "sequential",
        status: "ready",
        targetIds: [target.targetId],
        order: groups.length,
        maxGroupSize: 1,
        notProvenClaims: input.notProvenClaims,
      }));
    }
    return deepFreeze(groups);
  }

  let pendingParallel: string[] = [];
  const flushParallel = (): void => {
    if (pendingParallel.length === 0) return;
    groups.push(executionGroup({
      laneId: input.laneId,
      mode: "parallel",
      status: "ready",
      targetIds: pendingParallel,
      order: groups.length,
      maxGroupSize: input.maxGroupSize,
      notProvenClaims: input.notProvenClaims,
    }));
    pendingParallel = [];
  };

  for (const target of readyTargets) {
    const eligibility = input.parallelEligibility.find((item) =>
      item.targetId === sanitizeId(target.targetId)
    );
    if (eligibility?.groupable) {
      pendingParallel.push(target.targetId);
      if (pendingParallel.length >= input.maxGroupSize) {
        flushParallel();
      }
      continue;
    }
    flushParallel();
    groups.push(executionGroup({
      laneId: input.laneId,
      mode: "sequential",
      status: "ready",
      targetIds: [target.targetId],
      order: groups.length,
      maxGroupSize: 1,
      notProvenClaims: input.notProvenClaims,
    }));
  }
  flushParallel();

  for (const blocked of input.parallelEligibility.filter((item) =>
    item.status !== "eligible" && latestQueueEntry(input.queue, item.targetId)?.state !== "ready"
  )) {
    groups.push(executionGroup({
      laneId: input.laneId,
      mode: "blocked",
      status: "blocked",
      targetIds: [blocked.targetId],
      order: groups.length,
      maxGroupSize: input.maxGroupSize,
      blockedReason: blocked.status,
      notProvenClaims: input.notProvenClaims,
    }));
  }
  return deepFreeze(groups);
}

async function applyExecutionGroups(input: {
  readonly laneId: string;
  readonly input: MultiTargetMutationInput;
  readonly queue: MultiTargetQueueObservation[];
  readonly executionGroups: readonly MultiTargetExecutionGroup[];
  readonly settlements: MultiTargetSettlementObservation[];
  readonly notProvenClaims: readonly string[];
}): Promise<readonly MultiTargetMutationTargetInput[]> {
  const appliedTargets: MultiTargetMutationTargetInput[] = [];
  let stopAfterFailure = false;
  for (const group of input.executionGroups) {
    if (group.mode === "blocked") {
      continue;
    }
    const targets = group.targetIds.map((targetId) =>
      input.input.targets.find((item) => sanitizeId(item.targetId) === targetId)
    ).filter((target): target is MultiTargetMutationTargetInput => Boolean(target));
    if (stopAfterFailure) {
      for (const target of targets) {
        const latest = latestQueueEntry(input.queue, target.targetId);
        input.queue.push(queueObservation({
          laneId: input.laneId,
          target,
          state: "skipped",
          order: input.queue.length,
          targetSummary: latest?.targetSummary ?? sanitizeTargetSummary(target.reportSafeTargetSummary ?? target.relativePath),
          blocker: "earlier-group-failure",
          notProvenClaims: input.notProvenClaims,
        }));
        input.settlements.push(settlementObservation({
          laneId: input.laneId,
          groupId: group.groupId,
          target,
          status: "skipped",
          order: input.settlements.length,
          targetSummary: latest?.targetSummary ?? sanitizeTargetSummary(target.reportSafeTargetSummary ?? target.relativePath),
          originalFailure: "earlier-group-failure",
          notProvenClaims: input.notProvenClaims,
        }));
      }
      continue;
    }
    for (const target of targets) {
      const latest = latestQueueEntry(input.queue, target.targetId)!;
      input.queue.push(queueObservation({
        laneId: input.laneId,
        target,
        state: "applying",
        order: input.queue.length,
        targetSummary: latest.targetSummary,
        notProvenClaims: input.notProvenClaims,
      }));
    }
    const attempts = await Promise.allSettled(targets.map((target) => {
      const latest = latestQueueEntry(input.queue, target.targetId)!;
      return applyTarget({ input: input.input, target, laneId: input.laneId, targetSummary: latest.targetSummary });
    }));
    let groupFailed = false;
    for (const [index, target] of targets.entries()) {
      const latest = latestQueueEntry(input.queue, target.targetId)!;
      const attempt = attempts[index]!;
      if (attempt.status === "fulfilled") {
        appliedTargets.push(target);
        const contentFingerprint = fingerprint(target.proposedContent ?? "");
        input.queue.push(queueObservation({
          laneId: input.laneId,
          target,
          state: "applied",
          order: input.queue.length,
          targetSummary: latest.targetSummary,
          contentFingerprint,
          notProvenClaims: input.notProvenClaims,
        }));
        input.settlements.push(settlementObservation({
          laneId: input.laneId,
          groupId: group.groupId,
          target,
          status: "applied",
          order: input.settlements.length,
          targetSummary: latest.targetSummary,
          contentFingerprint,
          notProvenClaims: input.notProvenClaims,
        }));
      } else {
        groupFailed = true;
        const originalFailure = attempt.reason instanceof Error
          ? sanitizeText(attempt.reason.name, 80)
          : "unknown";
        input.queue.push(queueObservation({
          laneId: input.laneId,
          target,
          state: "failed",
          order: input.queue.length,
          targetSummary: latest.targetSummary,
          blocker: originalFailure,
          notProvenClaims: input.notProvenClaims,
        }));
        input.settlements.push(settlementObservation({
          laneId: input.laneId,
          groupId: group.groupId,
          target,
          status: "failed",
          order: input.settlements.length,
          targetSummary: latest.targetSummary,
          originalFailure,
          notProvenClaims: input.notProvenClaims,
        }));
      }
    }
    if (groupFailed) {
      stopAfterFailure = true;
    }
  }
  return appliedTargets;
}

function executionGroup(input: {
  readonly laneId: string;
  readonly mode: MultiTargetGroupMode;
  readonly status: MultiTargetGroupStatus;
  readonly targetIds: readonly string[];
  readonly order: number;
  readonly maxGroupSize: number;
  readonly blockedReason?: string;
  readonly notProvenClaims: readonly string[];
}): MultiTargetExecutionGroup {
  return deepFreeze({
    groupId: `${input.laneId}:group:${input.order}`,
    mode: input.mode,
    status: input.status,
    targetIds: input.targetIds.map(sanitizeId),
    order: input.order,
    maxGroupSize: input.maxGroupSize,
    ...(input.blockedReason ? { blockedReason: sanitizeText(input.blockedReason, 160) } : {}),
    terminalSuccessClaim: false,
    notProvenClaims: unique([`group-${input.status}-is-not-success`, ...input.notProvenClaims]),
  });
}

function settlementObservation(input: {
  readonly laneId: string;
  readonly groupId: string;
  readonly target: MultiTargetMutationTargetInput;
  readonly status: MultiTargetSettlementStatus;
  readonly order: number;
  readonly targetSummary: string;
  readonly originalFailure?: string;
  readonly contentFingerprint?: string;
  readonly notProvenClaims: readonly string[];
}): MultiTargetSettlementObservation {
  return deepFreeze({
    settlementId: `${input.laneId}:settlement:${sanitizeId(input.target.targetId)}:${input.order}`,
    groupId: input.groupId,
    targetId: sanitizeId(input.target.targetId),
    status: input.status,
    order: input.order,
    targetSummary: input.targetSummary,
    ...(input.originalFailure ? { originalFailure: sanitizeText(input.originalFailure, 120) } : {}),
    ...(input.contentFingerprint ? { contentFingerprint: input.contentFingerprint } : {}),
    terminalSuccessClaim: false,
    notProvenClaims: unique([`settlement-${input.status}-is-not-success`, ...input.notProvenClaims]),
  });
}

function parallelEligibilityStatus(input: {
  readonly target: MultiTargetMutationTargetInput;
  readonly classification: MultiTargetClassification;
  readonly targetAuthority?: MultiTargetAuthorityObservation["targetStatuses"][number];
  readonly staleRead: MultiTargetStaleReadObservation;
  readonly snapshot: MultiTargetSnapshotObservation;
  readonly queueEntry?: MultiTargetQueueObservation;
  readonly targetConflicts: readonly MultiTargetConflict[];
}): MultiTargetParallelEligibilityStatus {
  if (input.classification.status === "blocked") return "unsafe";
  if (input.targetConflicts.some((item) => item.kind === "dependency_ordering")) return "dependency_blocked";
  if (input.targetConflicts.some((item) => item.kind === "unsupported_operation")) {
    return input.target.operation === "unknown" ? "unknown" : "unsupported";
  }
  if (input.targetConflicts.length > 0) return "conflict";
  if (input.classification.status === "authority_required" || input.targetAuthority?.status !== "granted") {
    return "authority_required";
  }
  if (input.staleRead.status === "stale" || input.staleRead.status === "target_missing" ||
      input.staleRead.status === "target_exists") {
    return "stale";
  }
  if (input.staleRead.status !== "passed") return "blocked";
  if (input.snapshot.status === "unavailable") return "snapshot_missing";
  if (input.snapshot.status !== "planned") return "blocked";
  if (!input.snapshot.restorePlanAvailable) return "rollback_missing";
  if (
    input.target.operation === "delete" || input.target.operation === "move" ||
    input.target.operation === "unsupported"
  ) {
    return "unsupported";
  }
  if (input.target.operation === "unknown" || input.queueEntry?.state === "unknown") return "unknown";
  if (input.queueEntry?.state !== "ready") return "blocked";
  if ((input.target.dependsOnTargetIds?.length ?? 0) > 0) return "forced_sequential";
  return "eligible";
}

function parallelEligibilityReason(
  status: MultiTargetParallelEligibilityStatus,
  conflicts: readonly MultiTargetConflict[],
  staleRead: MultiTargetStaleReadObservation,
  snapshot: MultiTargetSnapshotObservation,
  targetAuthority?: MultiTargetAuthorityObservation["targetStatuses"][number],
): string {
  if (conflicts[0]) return sanitizeText(conflicts[0].kind, 160);
  if (targetAuthority?.status !== "granted") return `authority:${targetAuthority?.status ?? "missing"}`;
  if (staleRead.status !== "passed") return `stale-read:${staleRead.status}`;
  if (snapshot.status !== "planned") return `snapshot:${snapshot.status}`;
  return status === "eligible"
    ? "target independent and bounded group eligible"
    : status === "forced_sequential"
      ? "target dependency requires deterministic ordering"
      : status;
}

function boundedGroupSize(value: number | undefined): number {
  if (!Number.isFinite(value)) return 2;
  return Math.max(1, Math.min(8, Math.floor(value ?? 2)));
}

async function applyTarget(input: {
  readonly input: MultiTargetMutationInput;
  readonly target: MultiTargetMutationTargetInput;
  readonly laneId: string;
  readonly targetSummary: string;
}): Promise<void> {
  if (input.target.proposedContent === undefined) {
    throw new Error("MissingProposedContent");
  }
  await input.input.executionService.writeTextFile({
    operationKind: "file.write",
    absolutePath: absoluteTargetPath(input.input.workspaceRoot, input.target.relativePath),
    content: input.target.proposedContent,
    workspaceRoot: input.input.workspaceRoot,
    authority: {
      mode: "approved-for-write",
      source: "workspace-authority",
      reason: "controlled multi-target mutation authority granted",
    },
    caller: "edit-multifile",
    reason: "controlled multi-target mutation apply",
    reportSafeTarget: input.targetSummary,
  });
}

async function observeRollback(input: {
  readonly laneId: string;
  readonly input: MultiTargetMutationInput;
  readonly appliedTargets: readonly MultiTargetMutationTargetInput[];
  readonly required: boolean;
  readonly notProvenClaims: readonly string[];
}): Promise<MultiTargetRollbackObservation> {
  if (!input.required) {
    return deepFreeze({
      rollbackId: `${input.laneId}:rollback`,
      status: "not_required",
      targetIds: input.appliedTargets.map((target) => sanitizeId(target.targetId)),
      revertedTargetIds: [],
      failedTargetIds: [],
      preservesOriginalFailure: true,
      terminalSuccessClaim: false,
      notProvenClaims: unique(["rollback-not-required-is-not-success", ...input.notProvenClaims]),
    });
  }
  const revertedTargetIds: string[] = [];
  const failedTargetIds: string[] = [];
  for (const target of [...input.appliedTargets].reverse()) {
    if (target.expectedContent === undefined) {
      failedTargetIds.push(sanitizeId(target.targetId));
      continue;
    }
    try {
      await input.input.executionService.writeTextFile({
        operationKind: "file.write",
        absolutePath: absoluteTargetPath(input.input.workspaceRoot, target.relativePath),
        content: target.expectedContent,
        workspaceRoot: input.input.workspaceRoot,
        authority: {
          mode: "approved-for-write",
          source: "workspace-authority",
          reason: "controlled multi-target restore plan",
        },
        caller: "edit-multifile",
        reason: "controlled multi-target restore",
        reportSafeTarget: sanitizeTargetSummary(target.reportSafeTargetSummary ?? target.relativePath),
      });
      revertedTargetIds.push(sanitizeId(target.targetId));
    } catch {
      failedTargetIds.push(sanitizeId(target.targetId));
    }
  }
  return deepFreeze({
    rollbackId: `${input.laneId}:rollback`,
    status: failedTargetIds.length > 0 ? "failed" : "succeeded",
    targetIds: input.appliedTargets.map((target) => sanitizeId(target.targetId)),
    revertedTargetIds,
    failedTargetIds,
    preservesOriginalFailure: true,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      failedTargetIds.length > 0
        ? "rollback-failed-is-not-success"
        : "rollback-succeeded-is-not-task-success",
      "original-failure-preserved",
      ...input.notProvenClaims,
    ]),
  });
}

function observeRepairEligibility(input: {
  readonly laneId: string;
  readonly verificationResults: readonly VerificationResultObservation[];
  readonly wholeTaskVerificationResult: VerificationResultObservation;
  readonly repairTargetIds: readonly string[];
  readonly notProvenClaims: readonly string[];
}): MultiTargetRepairEligibility {
  const originalFailureIds = [
    ...input.verificationResults.filter((item) => item.status === "failed").map((item) => item.verificationId),
    ...(input.wholeTaskVerificationResult.status === "failed"
      ? [input.wholeTaskVerificationResult.verificationId]
      : []),
  ];
  const status: MultiTargetRepairEligibilityStatus = originalFailureIds.length === 0
    ? "not_needed"
    : input.repairTargetIds.length > 0
      ? "eligible"
      : "not_eligible";
  return deepFreeze({
    eligibilityId: `${input.laneId}:repair-eligibility`,
    status,
    targetIds: input.repairTargetIds.map(sanitizeId),
    originalFailureIds,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "repair-eligibility-is-not-success",
      "original-failures-preserved",
      ...input.notProvenClaims,
    ]),
  });
}

function targetReachedState(
  queue: readonly MultiTargetQueueObservation[],
  targetId: string,
  state: MultiTargetQueueState,
): boolean {
  return queue.some((item) => item.targetId === sanitizeId(targetId) && item.state === state);
}

function latestQueueEntry(
  queue: readonly MultiTargetQueueObservation[],
  targetId: string,
): MultiTargetQueueObservation | undefined {
  const sanitizedTargetId = sanitizeId(targetId);
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const item = queue[index];
    if (item?.targetId === sanitizedTargetId) {
      return item;
    }
  }
  return undefined;
}

function allReadyTargetsApplied(
  queue: readonly MultiTargetQueueObservation[],
  targets: readonly MultiTargetMutationTargetInput[],
): boolean {
  const readyTargetIds = new Set(
    queue.filter((item) => item.state === "ready").map((item) => item.targetId),
  );
  if (readyTargetIds.size === 0) {
    return false;
  }
  return targets.every((target) => {
    const targetId = sanitizeId(target.targetId);
    return !readyTargetIds.has(targetId) || targetReachedState(queue, targetId, "applied");
  });
}

function groupTargetsApplied(
  queue: readonly MultiTargetQueueObservation[],
  group: MultiTargetExecutionGroup,
): boolean {
  return group.targetIds.length > 0 &&
    group.targetIds.every((targetId) => targetReachedState(queue, targetId, "applied"));
}

function deterministicSettlementOrder(input: {
  readonly input: MultiTargetMutationInput;
  readonly settlements: readonly MultiTargetSettlementObservation[];
}): boolean {
  const finalTargetOrder = input.settlements
    .filter((item) => item.status === "applied" || item.status === "failed" || item.status === "skipped")
    .map((item) => item.targetId);
  const expectedOrder = input.input.targets
    .map((target) => sanitizeId(target.targetId))
    .filter((targetId) => finalTargetOrder.includes(targetId));
  return finalTargetOrder.every((targetId, index) => targetId === expectedOrder[index]);
}

function countState(
  queue: readonly MultiTargetQueueObservation[],
  state: MultiTargetQueueState,
): number {
  return queue.filter((item) => item.state === state).length;
}

function absoluteTargetPath(workspaceRoot: string, relativePath: string): string {
  return path.resolve(workspaceRoot, relativePath);
}

function pathEscapes(workspaceRoot: string, relativePath: string): boolean {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(root, relativePath);
  return target !== root && !target.startsWith(`${root}${path.sep}`);
}

function normalizedPath(relativePath: string): string {
  return path.normalize(relativePath).replace(/\\/g, "/");
}

function rangesOverlap(
  left: { readonly startLine: number; readonly endLine: number },
  right: { readonly startLine: number; readonly endLine: number },
): boolean {
  return left.startLine <= right.endLine && right.startLine <= left.endLine;
}

function fingerprint(content: string): string {
  return computeFragmentFingerprint(content).slice(0, 16);
}

function sanitizeTargetSummary(value: string): string {
  return sanitizeText(value, 160).replace(/\b(oldText|newText)\b/gi, "raw-content");
}

function sanitizeId(value: string): string {
  return sanitizeText(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Object.freeze(Array.from(new Set(values)).sort()) as readonly T[];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
