import { describe, expect, it } from "vitest";
import { projectEditRecoveryResult } from "./editRecoveryResult.js";
import type { EditSnapshotReceipt } from "./editSnapshot.js";

describe("editRecoveryResult", () => {
  it("reports success as snapshot-created without rollback need", () => {
    const result = projectEditRecoveryResult({
      routeStatus: "written",
      terminalClassification: "success",
      snapshotReceipt: snapshotReceipt(),
      recoverySurface: {
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
        restorableFiles: ["src/app.ts"],
        blockedFiles: [],
        recoveryAuthorityId: "authority-1",
        routeId: "fenced-edit-replacement",
        recoveryAction: "preview-restore",
        userFacingMessage: "restore preview available",
        evidence: ["recovery-surface:explicit-restore-only"],
      },
    });

    expect(result.snapshotState).toBe("snapshot-created");
    expect(result.rollbackReadiness).toBe("rollback-not-needed-success");
    expect(result.automaticRollback).toBe(false);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "edit-recovery-snapshot:snapshot-created",
        "edit-recovery-rollback:rollback-not-needed-success",
        "edit-recovery:no-raw-content",
      ]),
    );
  });

  it("reports writer and verification failures as rollback available when authority exists", () => {
    const result = projectEditRecoveryResult({
      routeStatus: "blocked",
      terminalClassification: "error",
      snapshotReceipt: snapshotReceipt(),
      recoverySurface: {
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
        restorableFiles: ["src/app.ts"],
        blockedFiles: [],
        recoveryAction: "preview-restore",
        userFacingMessage: "restore preview available",
        evidence: [],
      },
    });

    expect(result.rollbackReadiness).toBe("rollback-available");
    expect(result.rollbackPlanProjected).toBe(true);
    expect(result.terminalSummary).toContain("automatic rollback=no");
  });

  it("keeps no-write and snapshot failure distinct", () => {
    expect(
      projectEditRecoveryResult({
        routeStatus: "blocked",
        terminalClassification: "stopped",
        snapshotReceipt: {
          status: "snapshot-not-needed-no-write",
          preWriteFreshness: "not-applicable",
          storageStatus: "disabled",
          redactionStatus: "raw-content-excluded",
          cleanupClass: "no-residue",
          evidence: [],
        },
      }).rollbackReadiness,
    ).toBe("rollback-not-run");

    expect(
      projectEditRecoveryResult({
        routeStatus: "blocked",
        terminalClassification: "stopped",
        snapshotReceipt: {
          status: "snapshot-failed-no-mutation",
          preWriteFreshness: "not-applicable",
          storageStatus: "failed",
          redactionStatus: "raw-content-excluded",
          cleanupClass: "no-residue",
          evidence: [],
        },
      }).rollbackReadiness,
    ).toBe("rollback-not-supported");
  });
});

function snapshotReceipt(): EditSnapshotReceipt {
  return {
    status: "snapshot-created",
    snapshotId: "authority-1:update-src-app.ts",
    targetPath: "src/app.ts",
    workspaceRootHash: "workspace-hash",
    preWriteContentHash: "before-hash",
    preWriteSizeBytes: 16,
    preWriteFreshness: "final-stale-read-passed",
    storageStatus: "project-local",
    redactionStatus: "raw-content-excluded",
    createdAt: "2026-05-21T00:00:00.000Z",
    cleanupClass: "route-owned-retained",
    recoveryAuthorityId: "authority-1",
    recoveryRecordId: "update-src-app.ts",
    evidence: ["edit-snapshot:created-pre-write"],
  };
}
