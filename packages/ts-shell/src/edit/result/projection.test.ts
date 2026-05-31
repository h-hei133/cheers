import { describe, expect, it } from "vitest";

import { projectEditOperation } from "./projection.js";

describe("editFacade", () => {
  it("requires authority, apply, and post-write verification before success", () => {
    const projection = projectEditOperation({
      operationKind: "create-file",
      mode: "selected-workspace-apply",
      authority: "explicit-selected-workspace",
      applyStatus: "applied",
      verificationState: "passed",
      changedFiles: ["src/new.ts"],
      failedFiles: [],
      plannedFiles: ["src/new.ts"],
      recoveryAvailable: true,
      recoveryExecuted: false,
      atomicRollbackAvailable: false,
      providerCallDuringApply: false,
      reportedSuccess: true,
    });

    expect(projection.verdict.status).toBe("COMPLETE");
    expect(projection.readbackStatus).toBe("verified");
    expect(projection.applyIsVerificationSuccess).toBe(false);
  });

  it("does not let partial file failure become success", () => {
    const projection = projectEditOperation({
      operationKind: "multi-file-target-set",
      mode: "selected-workspace-apply",
      authority: "explicit-selected-workspace",
      applyStatus: "applied",
      verificationState: "blocked",
      changedFiles: ["src/a.ts"],
      failedFiles: ["src/b.ts"],
      plannedFiles: ["src/a.ts", "src/b.ts"],
      recoveryAvailable: true,
      recoveryExecuted: false,
      atomicRollbackAvailable: false,
      providerCallDuringApply: false,
      reportedSuccess: false,
    });

    expect(projection.verdict.status).toBe("BLOCKED");
    expect(projection.notProvenClaims).toEqual(
      expect.arrayContaining([
        "post-write verification/readback not proven",
        "partial file failure present",
      ]),
    );
    expect(projection.oneFileSuccessCanHideAnotherFailure).toBe(false);
  });

  it("keeps preview-only destructive operations not-run", () => {
    const projection = projectEditOperation({
      operationKind: "delete-file-preview",
      mode: "preview-only",
      authority: "not-granted",
      applyStatus: "not-run",
      verificationState: "not-run",
      changedFiles: [],
      failedFiles: [],
      plannedFiles: ["src/old.ts"],
      recoveryAvailable: false,
      recoveryExecuted: false,
      atomicRollbackAvailable: false,
      providerCallDuringApply: false,
      reportedSuccess: false,
    });

    expect(projection.verdict.status).toBe("NOT_PROVEN");
    expect(projection.notProvenClaims).toContain("edit authority not granted");
    expect(projection.changedFiles).toEqual([]);
  });
});
