import {
  hashContent,
  readRecoveryAuthorityRecord,
} from "./patchRecovery/recoveryAuthorityStore.js";
import {
  previewRecoveryAuthorityRestore,
  type RestorePreviewBlockedReason,
} from "./patchRecovery/restorePreview.js";
import type { WorkspaceWriteTargetAuthority } from "../edit/authority/workspace.js";

export type EditRecoveryMode = "single-file" | "target-set-subset";

export type EditRecoveryPlanBlocker =
  | "missing-snapshot"
  | "missing-target"
  | "ambiguous-target"
  | "out-of-workspace"
  | "stale-target"
  | "snapshot-target-mismatch"
  | "original-content-missing"
  | "confirmation-required"
  | "not-supported";

export interface EditRecoveryPlanRequestTarget {
  readonly snapshotId?: string;
  readonly targetPath?: string;
}

export interface EditRecoveryPlanTarget {
  readonly snapshotId: string;
  readonly authorityId: string;
  readonly recordId: string;
  readonly targetPath: string;
  readonly workspaceAuthority: Extract<WorkspaceWriteTargetAuthority, { ok: true }>;
  readonly beforeContentHash?: string;
  readonly beforeContentSizeBytes?: number;
  readonly expectedCurrentContentHash?: string;
  readonly staleTargetState:
    | "current-target-matches-snapshot-expectation"
    | "changed-since-snapshot"
    | "unknown";
  readonly verificationRequirement: "post-rollback-verification";
  readonly evidence: readonly string[];
}

export interface EditRecoveryPlanBlockedTarget {
  readonly snapshotId?: string;
  readonly targetPath?: string;
  readonly blocker: EditRecoveryPlanBlocker;
  readonly reason: string;
  readonly evidence: readonly string[];
}

export type EditRecoveryPlan =
  | {
      readonly status: "ready";
      readonly recoveryPlanId: string;
      readonly mode: EditRecoveryMode;
      readonly mutationScope: "single-file" | "bounded-subset";
      readonly maxFiles: number;
      readonly targets: readonly EditRecoveryPlanTarget[];
      readonly blockedTargets: readonly EditRecoveryPlanBlockedTarget[];
      readonly confirmationRequirement: "explicit-rollback-apply";
      readonly automaticRollback: false;
      readonly atomicRollback: false;
      readonly redactionStatus: "raw-content-excluded";
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "blocked";
      readonly recoveryPlanId: string;
      readonly mode: EditRecoveryMode;
      readonly mutationScope: "none";
      readonly maxFiles: number;
      readonly targets: readonly [];
      readonly blockedTargets: readonly EditRecoveryPlanBlockedTarget[];
      readonly blocker: EditRecoveryPlanBlocker;
      readonly reason: string;
      readonly confirmationRequirement: "explicit-rollback-apply";
      readonly automaticRollback: false;
      readonly atomicRollback: false;
      readonly redactionStatus: "raw-content-excluded";
      readonly evidence: readonly string[];
    };

export async function buildEditRecoveryPlan(input: {
  readonly mode: EditRecoveryMode;
  readonly ledgerRoot: string;
  readonly workspaceRoot: string;
  readonly requestedTargets: readonly EditRecoveryPlanRequestTarget[];
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
  readonly maxFiles?: number;
  readonly recoveryPlanId?: string;
}): Promise<EditRecoveryPlan> {
  const maxFiles = input.maxFiles ?? 3;
  const recoveryPlanId =
    input.recoveryPlanId ?? `edit-recovery-${hashContent(JSON.stringify(input.requestedTargets)).slice(0, 12)}`;
  const baseEvidence = [
    `edit-recovery-plan:id:${recoveryPlanId}`,
    `edit-recovery-plan:mode:${input.mode}`,
    `edit-recovery-plan:max-files:${maxFiles}`,
    "edit-recovery-plan:explicit-snapshot-required",
    "edit-recovery-plan:explicit-target-required",
    "edit-recovery-plan:no-automatic-rollback",
    "edit-recovery-plan:no-atomic-rollback",
    "edit-recovery-plan:raw-content-excluded",
  ];

  if (input.requestedTargets.length === 0) {
    return blockedPlan({
      recoveryPlanId,
      mode: input.mode,
      maxFiles,
      blocker: "missing-snapshot",
      reason: "Explicit rollback requires at least one snapshot id and target path.",
      blockedTargets: [],
      evidence: baseEvidence,
    });
  }

  if (input.requestedTargets.length > maxFiles) {
    return blockedPlan({
      recoveryPlanId,
      mode: input.mode,
      maxFiles,
      blocker: "not-supported",
      reason: `Explicit rollback subset has ${input.requestedTargets.length} files; max is ${maxFiles}.`,
      blockedTargets: input.requestedTargets.map((target) => ({
        snapshotId: target.snapshotId,
        targetPath: target.targetPath,
        blocker: "not-supported",
        reason: `Explicit rollback subset exceeds max ${maxFiles}.`,
        evidence: ["edit-recovery-plan:blocker:not-supported"],
      })),
      evidence: baseEvidence,
    });
  }

  const seenTargets = new Set<string>();
  const readyTargets: EditRecoveryPlanTarget[] = [];
  const blockedTargets: EditRecoveryPlanBlockedTarget[] = [];

  for (const target of input.requestedTargets) {
    const parsed = parseSnapshotId(target.snapshotId);
    if (!parsed) {
      blockedTargets.push(blockedTarget({
        snapshotId: target.snapshotId,
        targetPath: target.targetPath,
        blocker: "missing-snapshot",
        reason: "Explicit rollback requires a snapshot id in authority:record form.",
      }));
      continue;
    }
    if (!target.targetPath) {
      blockedTargets.push(blockedTarget({
        snapshotId: target.snapshotId,
        blocker: "missing-target",
        reason: "Explicit rollback requires a target path.",
      }));
      continue;
    }
    const normalizedTarget = normalizeTarget(target.targetPath);
    if (!normalizedTarget) {
      blockedTargets.push(blockedTarget({
        snapshotId: target.snapshotId,
        targetPath: target.targetPath,
        blocker: "out-of-workspace",
        reason: "Rollback target must be a workspace-relative path.",
      }));
      continue;
    }
    const seenKey = normalizedTarget.toLowerCase();
    if (seenTargets.has(seenKey)) {
      blockedTargets.push(blockedTarget({
        snapshotId: target.snapshotId,
        targetPath: normalizedTarget,
        blocker: "ambiguous-target",
        reason: "Explicit rollback target was selected more than once.",
      }));
      continue;
    }
    seenTargets.add(seenKey);

    const authority = input.validateWriteTarget(normalizedTarget);
    if (authority.ok === false) {
      blockedTargets.push(blockedTarget({
        snapshotId: target.snapshotId,
        targetPath: normalizedTarget,
        blocker: "out-of-workspace",
        reason: authority.message,
        evidence: authority.evidence,
      }));
      continue;
    }

    const preview = await previewRecoveryAuthorityRestore({
      ledgerRoot: input.ledgerRoot,
      authorityId: parsed.authorityId,
      workspaceRoot: input.workspaceRoot,
      recordIds: [parsed.recordId],
    });
    const record = await readRecoveryAuthorityRecord({
      ledgerRoot: input.ledgerRoot,
      authorityId: parsed.authorityId,
      recordId: parsed.recordId,
    });
    const restorable = preview.restorableFiles.find(
      (file) =>
        file.recordId === parsed.recordId &&
        file.workspaceRelativePath === normalizedTarget,
    );
    if (!record || preview.missingRecords.includes(parsed.recordId)) {
      blockedTargets.push(blockedTarget({
        snapshotId: target.snapshotId,
        targetPath: normalizedTarget,
        blocker: "missing-snapshot",
        reason: "Snapshot record was not found.",
        evidence: preview.evidence,
      }));
      continue;
    }
    if (record.workspaceRelativePath !== normalizedTarget) {
      blockedTargets.push(blockedTarget({
        snapshotId: target.snapshotId,
        targetPath: normalizedTarget,
        blocker: "snapshot-target-mismatch",
        reason: "Snapshot record does not belong to the requested target.",
        evidence: preview.evidence,
      }));
      continue;
    }
    if (!restorable) {
      const blocked = preview.blockedFiles.find(
        (file) => file.recordId === parsed.recordId,
      );
      const blocker = mapPreviewBlocker(blocked?.blockedReason);
      blockedTargets.push(blockedTarget({
        snapshotId: target.snapshotId,
        targetPath: normalizedTarget,
        blocker,
        reason: blocked
          ? `Snapshot cannot be restored: ${blocked.blockedReason}.`
          : "Snapshot cannot be restored for this target.",
        evidence: preview.evidence,
      }));
      continue;
    }

    readyTargets.push({
      snapshotId: target.snapshotId!,
      authorityId: parsed.authorityId,
      recordId: parsed.recordId,
      targetPath: normalizedTarget,
      workspaceAuthority: authority,
      ...(record.beforeContentHash
        ? { beforeContentHash: record.beforeContentHash }
        : {}),
      ...(record.beforeContentSizeBytes !== undefined
        ? { beforeContentSizeBytes: record.beforeContentSizeBytes }
        : {}),
      ...(record.expectedCurrentContentHash
        ? { expectedCurrentContentHash: record.expectedCurrentContentHash }
        : {}),
      staleTargetState: preview.currentContentMismatches.includes(normalizedTarget)
        ? "changed-since-snapshot"
        : "current-target-matches-snapshot-expectation",
      verificationRequirement: "post-rollback-verification",
      evidence: [
        ...preview.evidence,
        `edit-recovery-plan:target:${normalizedTarget}`,
        `edit-recovery-plan:snapshot:${target.snapshotId}`,
        "edit-recovery-plan:workspace-authority:ready",
        "edit-recovery-plan:current-content-guard-ready",
        "edit-recovery-plan:verification:required",
      ],
    });
  }

  if (readyTargets.length === 0) {
    const firstBlocker = blockedTargets[0]?.blocker ?? "not-supported";
    return blockedPlan({
      recoveryPlanId,
      mode: input.mode,
      maxFiles,
      blocker: firstBlocker,
      reason: blockedTargets[0]?.reason ?? "No rollback target is restorable.",
      blockedTargets,
      evidence: baseEvidence,
    });
  }

  return {
    status: "ready",
    recoveryPlanId,
    mode: input.mode,
    mutationScope: input.mode === "single-file" ? "single-file" : "bounded-subset",
    maxFiles,
    targets: readyTargets,
    blockedTargets,
    confirmationRequirement: "explicit-rollback-apply",
    automaticRollback: false,
    atomicRollback: false,
    redactionStatus: "raw-content-excluded",
    evidence: [
      ...baseEvidence,
      "edit-recovery-plan:created",
      `edit-recovery-plan:ready-count:${readyTargets.length}`,
      `edit-recovery-plan:blocked-count:${blockedTargets.length}`,
      "edit-recovery-plan:mutation-authority:not-granted",
      ...readyTargets.flatMap((target) => target.evidence),
      ...blockedTargets.flatMap((target) => target.evidence),
    ],
  };
}

function blockedPlan(input: {
  readonly recoveryPlanId: string;
  readonly mode: EditRecoveryMode;
  readonly maxFiles: number;
  readonly blocker: EditRecoveryPlanBlocker;
  readonly reason: string;
  readonly blockedTargets: readonly EditRecoveryPlanBlockedTarget[];
  readonly evidence: readonly string[];
}): EditRecoveryPlan {
  return {
    status: "blocked",
    recoveryPlanId: input.recoveryPlanId,
    mode: input.mode,
    mutationScope: "none",
    maxFiles: input.maxFiles,
    targets: [],
    blockedTargets: input.blockedTargets,
    blocker: input.blocker,
    reason: input.reason,
    confirmationRequirement: "explicit-rollback-apply",
    automaticRollback: false,
    atomicRollback: false,
    redactionStatus: "raw-content-excluded",
    evidence: [
      ...input.evidence,
      `edit-recovery-plan:blocker:${input.blocker}`,
      "edit-recovery-plan:rollback:not-run",
      ...input.blockedTargets.flatMap((target) => target.evidence),
    ],
  };
}

function blockedTarget(input: {
  readonly snapshotId?: string;
  readonly targetPath?: string;
  readonly blocker: EditRecoveryPlanBlocker;
  readonly reason: string;
  readonly evidence?: readonly string[];
}): EditRecoveryPlanBlockedTarget {
  return {
    ...(input.snapshotId ? { snapshotId: input.snapshotId } : {}),
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    blocker: input.blocker,
    reason: input.reason,
    evidence: [
      ...(input.evidence ?? []),
      `edit-recovery-plan:blocker:${input.blocker}`,
      "edit-recovery-plan:rollback:not-run",
    ],
  };
}

function parseSnapshotId(
  snapshotId: string | undefined,
): { readonly authorityId: string; readonly recordId: string } | undefined {
  const parts = snapshotId?.split(":");
  if (!parts || parts.length !== 2 || !parts[0] || !parts[1]) {
    return undefined;
  }
  return { authorityId: parts[0], recordId: parts[1] };
}

function normalizeTarget(targetPath: string): string | undefined {
  const normalized = targetPath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/")
  ) {
    return undefined;
  }
  return normalized;
}

function mapPreviewBlocker(
  reason: RestorePreviewBlockedReason | undefined,
): EditRecoveryPlanBlocker {
  switch (reason) {
    case "record-not-found":
      return "missing-snapshot";
    case "invalid-workspace-relative-path":
    case "workspace-boundary":
      return "out-of-workspace";
    case "record-path-mismatch":
      return "snapshot-target-mismatch";
    case "current-state-mismatch":
    case "current-content-hash-mismatch":
      return "stale-target";
    case "original-content-missing":
      return "original-content-missing";
    default:
      return "not-supported";
  }
}
