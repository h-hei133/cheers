import path from "node:path";
import type {
  MultiTargetOperationKind,
  MultiTargetClassificationStatus,
  MultiTargetConflictKind,
  MultiTargetAuthorityStatus,
  MultiTargetStaleReadStatus,
  MultiTargetSnapshotStatus,
  MultiTargetQueueState,
  MultiTargetGraphRelationKind,
  MultiTargetParallelEligibilityStatus,
  MultiTargetGroupMode,
  MultiTargetGroupStatus,
  MultiTargetSettlementStatus,
  MultiTargetVerificationStatus,
  MultiTargetRepairEligibilityStatus,
  MultiTargetVerdictStatus,
  MultiTargetMutationTargetInput,
  MultiTargetMutationInput,
  MultiTargetMutationPlan,
  MultiTargetClassification,
  MultiTargetConflict,
  MultiTargetAuthorityObservation,
  MultiTargetStaleReadObservation,
  MultiTargetSnapshotObservation,
  MultiTargetQueueObservation,
  MultiTargetGraphNode,
  MultiTargetParallelEligibility,
  MultiTargetExecutionGroup,
  MultiTargetSettlementObservation,
  MultiTargetRollbackObservation,
  MultiTargetRepairEligibility,
  MultiTargetMutationProjection,
} from "./types.js";
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
import {
  absoluteTargetPath,
  deepFreeze,
  fingerprint,
  sanitizeId,
  sanitizeTargetSummary,
  sanitizeText,
  unique,
} from "../sanitize.js";
import {
  buildGraph,
  latestQueueEntry,
  observeStaleRead,
  buildParallelEligibility,
  conflict,
  createExecutionGroups,
  initialQueueState,
  observeAuthority,
  observeSnapshot,
  queueBlocker,
  queueObservation,
} from "./observation.js";
import {
  allReadyTargetsApplied,
  boundedGroupSize,
  countState,
  deterministicSettlementOrder,
  groupTargetsApplied,
  observeRepairEligibility,
  settlementObservation,
  targetReachedState,
} from "./settlement.js";

export type {
  MultiTargetOperationKind,
  MultiTargetClassificationStatus,
  MultiTargetConflictKind,
  MultiTargetAuthorityStatus,
  MultiTargetStaleReadStatus,
  MultiTargetSnapshotStatus,
  MultiTargetQueueState,
  MultiTargetGraphRelationKind,
  MultiTargetParallelEligibilityStatus,
  MultiTargetGroupMode,
  MultiTargetGroupStatus,
  MultiTargetSettlementStatus,
  MultiTargetVerificationStatus,
  MultiTargetRepairEligibilityStatus,
  MultiTargetVerdictStatus,
  MultiTargetMutationTargetInput,
  MultiTargetMutationInput,
  MultiTargetMutationPlan,
  MultiTargetClassification,
  MultiTargetConflict,
  MultiTargetAuthorityObservation,
  MultiTargetStaleReadObservation,
  MultiTargetSnapshotObservation,
  MultiTargetQueueObservation,
  MultiTargetGraphNode,
  MultiTargetParallelEligibility,
  MultiTargetExecutionGroup,
  MultiTargetSettlementObservation,
  MultiTargetRollbackObservation,
  MultiTargetRepairEligibility,
  MultiTargetMutationProjection,
} from "./types.js";

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
  const classifiedTargets = input.targets.map((target) => ({
    target,
    classification: classifyTarget({
      laneId,
      workspaceRoot: input.workspaceRoot,
      target,
      notProvenClaims,
    }),
  }));
  const classifications = classifiedTargets.map((pair) => pair.classification);
  const conflicts = detectConflicts({ laneId, input, classifications, notProvenClaims });
  const authority = observeAuthority({ laneId, input, classifications, notProvenClaims });
  const staleReads: MultiTargetStaleReadObservation[] = [];
  const snapshots: MultiTargetSnapshotObservation[] = [];
  const queue: MultiTargetQueueObservation[] = [];
  for (const [index, { target, classification }] of classifiedTargets.entries()) {
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
    const target = input.targets.find((item) => item.targetId === targetId);
    if (!target) continue;
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
    const target = input.targets.find((item) => item.targetId === targetId);
    if (!target) continue;
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
    const target = input.targets[index] ?? missingTargetAt("verification intent", index);
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
    const group = executionGroups.filter((item) => item.mode !== "blocked")[index]
      ?? missingTargetAt("execution group", index);
    const applied = groupTargetsApplied(queue, group);
    const targetIds = input.targets.map((item) => sanitizeId(item.targetId));
    const groupTargetStatuses = group.targetIds.map((targetId) =>
      verificationResults.find((item, targetIndex) =>
        targetIds[targetIndex] === targetId
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
    const classification = input.classifications[index] ?? missingClassification(target.targetId);
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
  input.input.targets.forEach((left, leftIndex) => {
    for (const right of input.input.targets.slice(leftIndex + 1)) {
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
  });
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
      const latest = latestQueueEntry(input.queue, target.targetId) ?? missingQueueEntry(target.targetId);
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
      const latest = latestQueueEntry(input.queue, target.targetId) ?? missingQueueEntry(target.targetId);
      return applyTarget({ input: input.input, target, laneId: input.laneId, targetSummary: latest.targetSummary });
    }));
    let groupFailed = false;
    for (const [index, target] of targets.entries()) {
      const latest = latestQueueEntry(input.queue, target.targetId) ?? missingQueueEntry(target.targetId);
      const attempt = attempts[index] ?? missingQueueEntry(target.targetId);
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

function missingClassification(targetId: string): never {
  throw new Error(`Missing classification for target: ${targetId}`);
}

function missingQueueEntry(targetId: string): never {
  throw new Error(`Missing queue entry for target: ${targetId}`);
}

function missingTargetAt(what: string, index: number): never {
  throw new Error(`Missing ${what} at index ${index}`);
}
