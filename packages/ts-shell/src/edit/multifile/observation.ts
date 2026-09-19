import { freezeDeep } from "../../core/values/freeze.js";
import type {
  MultiTargetParallelEligibilityStatus,
  MultiTargetAuthorityObservation,
  MultiTargetAuthorityStatus,
  MultiTargetClassification,
  MultiTargetConflict,
  MultiTargetConflictKind,
  MultiTargetExecutionGroup,
  MultiTargetGraphNode,
  MultiTargetGraphRelationKind,
  MultiTargetGroupMode,
  MultiTargetGroupStatus,
  MultiTargetMutationInput,
  MultiTargetMutationTargetInput,
  MultiTargetParallelEligibility,
  MultiTargetQueueObservation,
  MultiTargetQueueState,
  MultiTargetSnapshotObservation,
  MultiTargetStaleReadObservation,
} from "./types.js";

import { redactReportText } from "../../core/security/redaction.js";
import { absoluteTargetPath, fingerprint, sanitizeId, sanitizeTargetSummary, unique } from "../sanitize.js";

/**
 * Multi-target lane observation.
 *
 * Derives authority, stale-read, snapshot, conflict, queue, and execution-group
 * observations for one lane. Everything here reads lane state and returns frozen
 * descriptions; the write path in `./model.js` sequences these.
 */

export function conflict(input: {
  readonly laneId: string;
  readonly kind: MultiTargetConflictKind;
  readonly targetIds: readonly string[];
  readonly reason: string;
  readonly notProvenClaims: readonly string[];
}): MultiTargetConflict {
  return freezeDeep({
    conflictId: `${input.laneId}:conflict:${input.kind}:${input.targetIds.map(sanitizeId).join("+")}`,
    kind: input.kind,
    targetIds: input.targetIds.map(sanitizeId),
    blocked: true,
    reason: redactReportText(input.reason, 180),
    terminalSuccessClaim: false,
    notProvenClaims: unique(["conflict-check-is-not-success", ...input.notProvenClaims]),
  });
}
export function observeAuthority(input: {
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
      reason: redactReportText(
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
  return freezeDeep({
    authorityId: `${input.laneId}:authority`,
    status,
    targetStatuses,
    terminalSuccessClaim: false,
    notProvenClaims: unique(["authority-is-not-success", ...input.notProvenClaims]),
  });
}
export async function observeStaleRead(input: {
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
    return freezeDeep({
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
      return freezeDeep({
        staleReadId: `${input.laneId}:stale-read:${sanitizeId(input.target.targetId)}`,
        targetId: sanitizeId(input.target.targetId),
        status: "target_exists",
        targetSummary,
        currentFingerprint,
        terminalSuccessClaim: false,
        notProvenClaims: unique(["create-target-exists-is-not-success", ...input.notProvenClaims]),
      });
    }
    return freezeDeep({
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
    return freezeDeep({
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
export function observeSnapshot(input: {
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
    return freezeDeep({
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
    return freezeDeep({
      snapshotId: `${input.laneId}:snapshot:${sanitizeId(input.target.targetId)}`,
      targetId: sanitizeId(input.target.targetId),
      status: "unavailable",
      restorePlanAvailable: false,
      targetSummary,
      blocker: redactReportText(input.target.snapshot.reason ?? "snapshot unavailable", 160),
      terminalSuccessClaim: false,
      notProvenClaims: unique(["snapshot-unavailable-is-not-success", ...input.notProvenClaims]),
    });
  }
  return freezeDeep({
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
export function initialQueueState(input: {
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
export function queueBlocker(input: {
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
export function queueObservation(input: {
  readonly laneId: string;
  readonly target: MultiTargetMutationTargetInput;
  readonly state: MultiTargetQueueState;
  readonly targetSummary: string;
  readonly order: number;
  readonly blocker?: string;
  readonly contentFingerprint?: string;
  readonly notProvenClaims: readonly string[];
}): MultiTargetQueueObservation {
  return freezeDeep({
    queueId: `${input.laneId}:queue:${sanitizeId(input.target.targetId)}:${input.order}`,
    targetId: sanitizeId(input.target.targetId),
    state: input.state,
    targetSummary: input.targetSummary,
    order: input.order,
    ...(input.blocker ? { blocker: redactReportText(input.blocker, 160) } : {}),
    ...(input.contentFingerprint ? { contentFingerprint: input.contentFingerprint } : {}),
    terminalSuccessClaim: false,
    notProvenClaims: unique([`queue-${input.state}-is-not-success`, ...input.notProvenClaims]),
  });
}
export function buildGraph(input: {
  readonly laneId: string;
  readonly input: MultiTargetMutationInput;
  readonly classifications: readonly MultiTargetClassification[];
  readonly conflicts: readonly MultiTargetConflict[];
  readonly notProvenClaims: readonly string[];
}): readonly MultiTargetGraphNode[] {
  return freezeDeep(input.input.targets.map((target, index) => {
    const targetId = sanitizeId(target.targetId);
    const targetConflicts = input.conflicts.filter((item) => item.targetIds.includes(targetId));
    const classification = input.classifications[index] ?? missingClassification(targetId);
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
export function buildParallelEligibility(input: {
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
  return freezeDeep(input.input.targets.map((target, index) => {
    const targetId = sanitizeId(target.targetId);
    const classification = input.classifications[index] ?? missingClassification(targetId);
    const targetAuthority = input.authority.targetStatuses[index];
    const staleRead = input.staleReads[index] ?? missingLaneObservation(targetId);
    const snapshot = input.snapshots[index] ?? missingLaneObservation(targetId);
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
export function createExecutionGroups(input: {
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
    return freezeDeep(groups);
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
  return freezeDeep(groups);
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
  return freezeDeep({
    groupId: `${input.laneId}:group:${input.order}`,
    mode: input.mode,
    status: input.status,
    targetIds: input.targetIds.map(sanitizeId),
    order: input.order,
    maxGroupSize: input.maxGroupSize,
    ...(input.blockedReason ? { blockedReason: redactReportText(input.blockedReason, 160) } : {}),
    terminalSuccessClaim: false,
    notProvenClaims: unique([`group-${input.status}-is-not-success`, ...input.notProvenClaims]),
  });
}

export function parallelEligibilityStatus(input: {
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
export function parallelEligibilityReason(
  status: MultiTargetParallelEligibilityStatus,
  conflicts: readonly MultiTargetConflict[],
  staleRead: MultiTargetStaleReadObservation,
  snapshot: MultiTargetSnapshotObservation,
  targetAuthority?: MultiTargetAuthorityObservation["targetStatuses"][number],
): string {
  if (conflicts[0]) return redactReportText(conflicts[0].kind, 160);
  if (targetAuthority?.status !== "granted") return `authority:${targetAuthority?.status ?? "missing"}`;
  if (staleRead.status !== "passed") return `stale-read:${staleRead.status}`;
  if (snapshot.status !== "planned") return `snapshot:${snapshot.status}`;
  return status === "eligible"
    ? "target independent and bounded group eligible"
    : status === "forced_sequential"
      ? "target dependency requires deterministic ordering"
      : status;
}
export function latestQueueEntry(
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

function missingClassification(targetId: string): never {
  throw new Error(`Missing classification for target: ${targetId}`);
}

function missingLaneObservation(targetId: string): never {
  throw new Error(`Missing lane observation for target: ${targetId}`);
}
