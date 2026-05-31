import {
  buildEditRecoveryPlan,
  type EditRecoveryPlan,
} from "./editRecoveryPlan.js";
import type { TargetSetEditRoute } from "./targetSetEditRoute.js";
import type { WorkspaceWriteTargetAuthority } from "../edit/authority/workspace.js";

export async function buildTargetSetPartialRecoveryPlan(input: {
  readonly route: TargetSetEditRoute;
  readonly ledgerRoot: string;
  readonly workspaceRoot: string;
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
  readonly confirmedSnapshotIds?: readonly string[];
  readonly maxFiles?: number;
  readonly recoveryPlanId?: string;
}): Promise<EditRecoveryPlan> {
  const eligibleTargets = input.route.fileResults
    .filter((result) => result.status === "written")
    .map((result) => {
      const snapshotId = result.route?.snapshotReceipt.snapshotId;
      return {
        snapshotId,
        targetPath: result.targetPath,
      };
    })
    .filter((target) => Boolean(target.snapshotId));
  const selectedTargets = input.confirmedSnapshotIds
    ? eligibleTargets.filter((target) =>
        input.confirmedSnapshotIds!.includes(target.snapshotId!),
      )
    : eligibleTargets;

  return buildEditRecoveryPlan({
    mode: "target-set-subset",
    ledgerRoot: input.ledgerRoot,
    workspaceRoot: input.workspaceRoot,
    requestedTargets: selectedTargets,
    validateWriteTarget: input.validateWriteTarget,
    maxFiles: input.maxFiles,
    recoveryPlanId:
      input.recoveryPlanId ??
      `target-set-recovery-${input.route.manifestId}`,
  });
}
