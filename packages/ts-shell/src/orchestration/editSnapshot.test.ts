import { describe, expect, it } from "vitest";
import {
  editSnapshotEvidence,
  projectEditSnapshotReceipt,
} from "./editSnapshot.js";
import type { RecoveryAuthorityCaptureBatchResult } from "./patchRecovery/recoveryAuthorityStore.js";

describe("editSnapshot", () => {
  it("projects pre-write capture metadata without raw content", () => {
    const capture: RecoveryAuthorityCaptureBatchResult = {
      status: "captured",
      records: [
        {
          schemaVersion: 1,
          authorityId: "authority-1",
          recordId: "update-src-app.ts",
          workspaceRelativePath: "src/app.ts",
          operationKind: "update",
          beforeState: "exists",
          beforeContentHash: "hash-before",
          beforeContentSizeBytes: 16,
          beforeContentRef: "blobs/hash-before.content",
          expectedCurrentState: "exists",
          expectedCurrentContentHash: "hash-after",
          capturedAtPhase: "pre-write",
          persistence: "non-default",
          createdAt: "2026-05-21T00:00:00.000Z",
          evidence: ["recovery-authority-store:captured-pre-write"],
        },
      ],
      evidence: ["recovery-authority-store:batch-captured-pre-write"],
    };

    const receipt = projectEditSnapshotReceipt({
      workspaceRoot: "/workspace",
      capture,
    });

    expect(receipt).toMatchObject({
      status: "snapshot-created",
      snapshotId: "authority-1:update-src-app.ts",
      targetPath: "src/app.ts",
      preWriteContentHash: "hash-before",
      preWriteSizeBytes: 16,
      preWriteFreshness: "final-stale-read-passed",
      storageStatus: "project-local",
      redactionStatus: "raw-content-excluded",
      cleanupClass: "route-owned-retained",
    });
    expect(editSnapshotEvidence(receipt)).toEqual(
      expect.arrayContaining([
        "edit-snapshot-status:snapshot-created",
        "edit-snapshot-receipt:present",
        "edit-snapshot:no-raw-content",
      ]),
    );
    expect(JSON.stringify(receipt)).not.toContain("status: draft");
  });

  it("classifies disabled and blocked capture as no-write safe states", () => {
    expect(
      projectEditSnapshotReceipt({
        targetPath: "src/app.ts",
        capture: {
          status: "disabled",
          blockedReason: "disabled",
          records: [],
          evidence: ["recovery-authority-store:disabled"],
        },
      }).status,
    ).toBe("snapshot-not-needed-no-write");

    const blocked = projectEditSnapshotReceipt({
      targetPath: "src/app.ts",
      capture: {
        status: "blocked",
        blockedReason: "ledger-root-required",
        records: [],
        message: "missing ledger root",
        evidence: ["recovery-authority-store:capture-blocked"],
      },
    });
    expect(blocked.status).toBe("snapshot-failed-no-mutation");
    expect(blocked.evidence).toContain("edit-snapshot:failed-no-mutation");
  });
});
