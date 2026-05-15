import { describe, expect, it } from "vitest";
import {
  projectRecoverySurfaceSummary,
  type RecoverySurfaceSummary,
} from "./recoverySurfaceProjection.js";
import type { RecoveryAuthorityCaptureBatchResult } from "./recoveryAuthorityStore.js";

describe("recovery surface projection", () => {
  it("summarizes captured authority as explicit restore only", () => {
    const summary = projectRecoverySurfaceSummary({
      routeId: "single-file-apply-patch-workspace-write",
      recoveryAuthorityCapture: capturedAuthority(),
    });

    expect(summary).toEqual(
      expect.objectContaining<Partial<RecoverySurfaceSummary>>({
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
        restorableFiles: ["src/a.ts", "src/new.ts"],
        recoveryAuthorityId: "route-summary",
        recoveryAction: "preview-restore",
      }),
    );
    expect(summary.userFacingMessage).toContain("No automatic recovery ran");
  });

  it("does not claim restore when authority is absent", () => {
    const summary = projectRecoverySurfaceSummary({
      routeId: "single-file-apply-patch-workspace-write",
    });

    expect(summary.recoveryAvailable).toBe(false);
    expect(summary.explicitRestoreAvailable).toBe(false);
    expect(summary.automaticRecoveryAvailable).toBe(false);
    expect(summary.atomicRollbackAvailable).toBe(false);
    expect(summary.recoveryExecuted).toBe(false);
    expect(summary.recoveryAction).toBe("none");
  });

  it("projects blocked capture without recovery or rollback claims", () => {
    const summary = projectRecoverySurfaceSummary({
      recoveryAuthorityCapture: {
        status: "blocked",
        blockedReason: "ledger-root-required",
        records: [],
        message: "missing ledger root",
        evidence: ["capture-blocked"],
      },
    });

    expect(summary.recoveryAvailable).toBe(false);
    expect(summary.blockedFiles[0]?.reason).toBe("ledger-root-required");
    expect(summary.automaticRecoveryAvailable).toBe(false);
    expect(summary.atomicRollbackAvailable).toBe(false);
  });
});

function capturedAuthority(): RecoveryAuthorityCaptureBatchResult {
  return {
    status: "captured",
    records: [
      {
        schemaVersion: 1,
        authorityId: "route-summary",
        recordId: "update-a",
        workspaceRelativePath: "src/a.ts",
        operationKind: "update",
        beforeState: "exists",
        beforeContentHash: "hash",
        beforeContentSizeBytes: 7,
        beforeContentRef: "blobs/hash.content",
        expectedCurrentState: "exists",
        expectedCurrentContentHash: "after-hash",
        capturedAtPhase: "pre-write",
        persistence: "non-default",
        createdAt: "2026-05-15T00:00:00.000Z",
        evidence: [],
      },
      {
        schemaVersion: 1,
        authorityId: "route-summary",
        recordId: "create-new",
        workspaceRelativePath: "src/new.ts",
        operationKind: "create",
        beforeState: "absent",
        expectedCurrentState: "exists",
        expectedCurrentContentHash: "created-hash",
        capturedAtPhase: "pre-write",
        persistence: "non-default",
        createdAt: "2026-05-15T00:00:01.000Z",
        evidence: [],
      },
    ],
    evidence: ["capture-ok"],
  };
}
