import { describe, expect, it } from "vitest";
import {
  buildOriginalContentCaptureRequirements,
  projectOriginalContentAuthority,
} from "./journalOriginalContentAuthority.js";
import type { RouteScopedEditJournal } from "../../../orchestration/patchResult/routeScopedEditJournal.js";

describe("journal original-content authority seam", () => {
  it("derives capture requirements without reading or storing content", () => {
    const requirements = buildOriginalContentCaptureRequirements(
      journal({
        routeId: "route-original-content",
        operations: [
          {
            operationId: "op-1",
            operationKind: "update",
            targetPath: "src/app.ts",
            planned: true,
          },
          {
            operationId: "op-2",
            operationKind: "create",
            targetPath: "src/new.ts",
            planned: true,
          },
        ],
      }),
    );

    expect(requirements).toEqual([
      expect.objectContaining({
        filePath: "src/app.ts",
        operationKind: "update",
        requiresOriginalContent: true,
        requiresCurrentContentCheck: true,
        requiresWorkspaceAuthority: true,
        requiresPersistence: true,
      }),
      expect.objectContaining({
        filePath: "src/new.ts",
        operationKind: "create",
        requiresOriginalContent: false,
        requiresCurrentContentCheck: true,
        requiresWorkspaceAuthority: true,
        requiresPersistence: true,
      }),
    ]);
  });

  it("projects missing authority as ineligible for restore", () => {
    const projection = projectOriginalContentAuthority({
      journal: journal({
        routeId: "route-missing-authority",
        operations: [
          {
            operationId: "op-1",
            operationKind: "delete",
            targetPath: "src/remove.ts",
            planned: true,
            failed: true,
            failureClass: "post-write-verification",
          },
        ],
      }),
    });

    expect(projection.status).toBe("missing");
    expect(projection.records).toEqual([]);
    expect(projection.restoreEligibility).toEqual(
      expect.objectContaining({
        canAttemptRestore: false,
        blockers: expect.arrayContaining([
          "no-original-content",
          "no-persistence-authority",
          "no-current-content-inspection",
          "no-recovery-executor",
        ]),
        missing: expect.arrayContaining([
          "original-content-authority",
          "durable-persistence",
          "current-content-inspection",
          "restore-workspace-authority",
          "recovery-executor",
        ]),
      }),
    );
    expect(projection.evidence).toEqual(
      expect.arrayContaining([
        "journal-original-content-authority:no-file-read",
        "journal-original-content-authority:no-content-captured",
        "journal-original-content-authority:no-persistence",
      ]),
    );
  });

  it("treats hash-only records as non-restorable content authority", () => {
    const projection = projectOriginalContentAuthority({
      journal: journal({
        routeId: "route-hash-only",
        operations: [
          {
            operationId: "op-1",
            operationKind: "update",
            targetPath: "src/app.ts",
            planned: true,
          },
        ],
      }),
      records: [
        {
          filePath: "src/app.ts",
          operationKind: "update",
          beforeContentHash: "hash-before",
          beforeContentAvailable: false,
          capturedAtPhase: "pre-write",
          persistence: "non-default",
        },
      ],
    });

    expect(projection.status).toBe("hash-only");
    expect(projection.restoreEligibility.canAttemptRestore).toBe(false);
    expect(projection.restoreEligibility.missing).toContain(
      "restorable-original-content",
    );
  });
});

function journal(input: RouteScopedEditJournal): RouteScopedEditJournal {
  return input;
}
