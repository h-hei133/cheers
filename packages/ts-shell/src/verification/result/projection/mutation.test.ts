import { describe, expect, it } from "vitest";
import { projectMutationVerificationHandoff } from "./mutation.js";

describe("mutation verification projection", () => {
  it("keeps verified writes successful with real changed files", () => {
    const handoff = projectMutationVerificationHandoff({
      changedFiles: ["src/app.ts"],
      failedFiles: [],
      verification: { status: "passed", reason: "verify completed" },
    });

    expect(handoff.kind).toBe("write-verified");
    expect(handoff.taskVerdict).toBe("satisfied");
    expect(handoff.changedFiles).toEqual(["src/app.ts"]);
    expect(handoff.failedFiles).toEqual([]);
    expect(handoff.actionableEvidence).toEqual([]);
  });

  it("keeps verification-blocked stopped semantics without success leakage", () => {
    const handoff = projectMutationVerificationHandoff({
      changedFiles: ["src/app.ts"],
      failedFiles: [],
      verification: {
        status: "blocked",
        reason: "approval denied for verify command",
        blockerKind: "approval-denied",
        nextAction: "Approve the verify command or run it manually.",
      },
    });

    expect(handoff.kind).toBe("verification-blocked");
    expect(handoff.taskVerdict).toBe("completed-with-caveats");
    expect(handoff.nextAction).toBe("Approve the verify command or run it manually.");
    expect(handoff.changedFiles).toEqual(["src/app.ts"]);
    expect(handoff.failedFiles).toEqual([]);
    expect(handoff.verificationBlockerKind).toBe("approval-denied");
    expect(handoff.actionableEvidence).toContain(
      "actionable-blocker-kind:verification-failed",
    );
  });

  it("classifies post-write verification failure with no changedFiles claim", () => {
    const handoff = projectMutationVerificationHandoff({
      changedFiles: [],
      failedFiles: [
        {
          path: "src/app.ts",
          reason: "post-write verification did not match approved content",
        },
      ],
      verification: {
        status: "blocked",
        reason: "post-write verification did not match approved content",
      },
      targetPath: "src/app.ts",
      routeBlocker: "post-write-verification",
      writerStarted: true,
      writeEffect: "unverified",
      postWriteVerification: "failed",
    });

    expect(handoff.kind).toBe("post-write-verification-failed");
    expect(handoff.patchFailureCode).toBe("readback-mismatch");
    expect(handoff.taskVerdict).toBe("insufficient-evidence");
    expect(handoff.changedFiles).toEqual([]);
    expect(handoff.failedFiles).toEqual([
      {
        path: "src/app.ts",
        reason: "post-write verification did not match approved content",
      },
    ]);
    expect(handoff.requiresUserInspection).toBe(true);
  });

  it("classifies protected file changes as verification failures", () => {
    const handoff = projectMutationVerificationHandoff({
      changedFiles: ["src/app.ts"],
      failedFiles: [],
      verification: {
        status: "failed",
        reason: "LOCKED.md changed but was expected to remain unchanged.",
      },
    });

    expect(handoff.kind).toBe("protected-file-changed");
    expect(handoff.nextAction).toBe(
      "Restore the protected file, then rerun unchanged-file verification.",
    );
    expect(handoff.patchFailureCode).toBe("readback-mismatch");
    expect(handoff.failedFiles).toEqual([]);
  });

  it("classifies stale-read blockers distinctly", () => {
    const handoff = projectMutationVerificationHandoff({
      changedFiles: [],
      failedFiles: [
        {
          path: "src/app.ts",
          reason: "stale-read: Target file changed since it was read.",
        },
      ],
      verification: {
        status: "skipped",
        reason: "stale-read: Target file changed since it was read.",
      },
      routeBlocker: "final-stale-read",
    });

    expect(handoff.kind).toBe("stale-read");
    expect(handoff.patchFailureCode).toBe("stale-read");
    expect(handoff.actionableEvidence).toEqual([
      "actionable-blocker-kind:stale-read",
    ]);
    expect(handoff.changedFiles).toEqual([]);
  });

  it("keeps writer-started unknown and unverified as inspection-required handoffs", () => {
    const unknown = projectMutationVerificationHandoff({
      changedFiles: [],
      failedFiles: [{ path: "src/app.ts", reason: "writer threw" }],
      verification: { status: "blocked", reason: "writer threw" },
      targetPath: "src/app.ts",
      writerStarted: true,
      writeEffect: "unknown",
    });
    const unverified = projectMutationVerificationHandoff({
      changedFiles: [],
      failedFiles: [{ path: "src/app.ts", reason: "readback mismatch" }],
      verification: { status: "blocked", reason: "readback mismatch" },
      targetPath: "src/app.ts",
      writerStarted: true,
      writeEffect: "unverified",
    });

    expect(unknown.kind).toBe("writer-started-unknown");
    expect(unknown.patchFailureCode).toBe("write-failed");
    expect(unknown.requiresUserInspection).toBe(true);
    expect(unknown.nextAction).toContain("Re-read src/app.ts");
    expect(unverified.kind).toBe("writer-started-unverified");
    expect(unverified.patchFailureCode).toBe("readback-mismatch");
    expect(unverified.requiresUserInspection).toBe(true);
    expect(unverified.nextAction).toContain("Re-read src/app.ts");
  });

  it("keeps unsupported patch shape clear and no-write", () => {
    const handoff = projectMutationVerificationHandoff({
      changedFiles: [],
      failedFiles: [
        {
          path: "(apply_patch)",
          reason: "unsupported patch operation: add",
        },
      ],
      verification: { status: "skipped" },
      routeBlocker: "patch-verification",
    });

    expect(handoff.kind).toBe("unsupported-patch-shape");
    expect(handoff.patchFailureCode).toBe("patch-generation-failed");
    expect(handoff.changedFiles).toEqual([]);
    expect(handoff.nextAction).toBe(
      "Regenerate a supported single-file Update File patch against current content.",
    );
  });

  it("does not report success when no mutation happened", () => {
    const handoff = projectMutationVerificationHandoff({
      changedFiles: [],
      failedFiles: [],
      verification: { status: "not-requested" },
    });

    expect(handoff.kind).toBe("no-mutation");
    expect(handoff.taskVerdict).toBe("insufficient-evidence");
    expect(handoff.changedFiles).toEqual([]);
    expect(handoff.failedFiles).toEqual([]);
  });
});
