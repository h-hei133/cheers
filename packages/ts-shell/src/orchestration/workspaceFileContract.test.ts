import { describe, expect, it } from "vitest";
import {
  buildStaleReadFact,
  buildVerificationPreconditionFact,
  buildWorkspaceFactSummary,
  buildWorkspaceTargetFact,
  buildWriteAuthorityFact,
  safeTargetLabel,
} from "./workspaceFileContract.js";
import {
  projectAmbiguousTargetStoppedSummary,
  projectContinuationSafeTargetSummary,
  projectFutureDiscoveryCandidateSummary,
  projectMissingTargetStoppedSummary,
  projectOutOfWorkspaceTargetStoppedSummary,
  projectReadOnlyTargetSummary,
  projectStaleReadBlockedSummary,
  projectWriteAuthorityTargetSummary,
} from "./workspaceTargetProjection.js";

describe("workspaceFileContract", () => {
  it("projects workspace roots and explicit in-workspace targets as safe labels", () => {
    expect(
      buildWorkspaceFactSummary({
        workspaceRoot: "/home/wang/projects/coding-agents",
        projectRoot: "/home/wang/projects/coding-agents/packages/ts-shell",
      }),
    ).toMatchObject({
      workspaceLabel: "/home/wang/projects/coding-agents",
      projectLabel: "/home/wang/projects/coding-agents/packages/ts-shell",
    });

    expect(
      buildWorkspaceTargetFact({
        kind: "explicit-target",
        targetPath: "./src/app.ts",
      }),
    ).toMatchObject({
      kind: "explicit-target",
      safeLabel: "src/app.ts",
      targetPath: "src/app.ts",
      candidates: [],
    });
  });

  it("keeps missing, ambiguous, and out-of-workspace targets stopped", () => {
    expect(
      projectMissingTargetStoppedSummary({
        targetHint: "src/missing.ts",
      }),
    ).toMatchObject({
      result: "stopped",
      reasonCode: "missing-target",
      target: { kind: "missing-target", safeLabel: "src/missing.ts" },
    });

    expect(
      projectAmbiguousTargetStoppedSummary({
        candidates: ["src/a.ts", "src/b.ts"],
      }),
    ).toMatchObject({
      result: "stopped",
      reasonCode: "ambiguous-target",
      target: { candidates: ["src/a.ts", "src/b.ts"] },
    });

    expect(
      projectOutOfWorkspaceTargetStoppedSummary({
        targetPath: "../outside.ts",
      }),
    ).toMatchObject({
      result: "stopped",
      reasonCode: "out-of-workspace-target",
      target: { safeLabel: "../outside.ts" },
    });
  });

  it("separates read-only and write-authority projections", () => {
    expect(projectReadOnlyTargetSummary({ targetPath: "src/view.ts" })).toMatchObject({
      targetLabel: "src/view.ts",
      authority: {
        mode: "read",
        decision: "available",
      },
    });

    expect(
      buildWriteAuthorityFact({
        targetPath: "src/edit.ts",
        decision: "blocked",
        reasonCode: "target-symlink",
      }),
    ).toMatchObject({
      mode: "write",
      decision: "blocked",
      reasonCode: "target-symlink",
      targetLabel: "src/edit.ts",
    });

    expect(
      projectWriteAuthorityTargetSummary({
        targetPath: "src/edit.ts",
        decision: "not-authorized",
      }),
    ).toMatchObject({
      authority: {
        mode: "write",
        decision: "not-authorized",
      },
    });
  });

  it("projects stale-read and verification preconditions without bypassing them", () => {
    expect(
      buildStaleReadFact({
        targetPath: "src/app.ts",
        status: "blocked",
      }),
    ).toMatchObject({
      status: "blocked",
      reasonCode: "blocked",
      evidence: ["workspace-stale-read:blocked"],
    });

    expect(
      projectStaleReadBlockedSummary({
        targetPath: "src/app.ts",
      }),
    ).toMatchObject({
      result: "stopped",
      reasonCode: "stale-read",
      staleRead: { status: "blocked" },
    });

    expect(
      buildVerificationPreconditionFact({
        targetPath: "src/app.ts",
        required: ["final-stale-read", "post-write-verification"],
        satisfied: ["final-stale-read"],
      }),
    ).toMatchObject({
      status: "missing",
      missing: ["post-write-verification"],
    });
  });

  it("projects continuation and future discovery summaries without mutation authority", () => {
    expect(
      projectContinuationSafeTargetSummary({
        status: "relocated",
        targetPath: "src/new.ts",
        relocatedFrom: "old.ts",
      }),
    ).toMatchObject({
      targetLabel: "src/new.ts",
      status: "relocated",
    });

    expect(
      projectFutureDiscoveryCandidateSummary({
        candidates: ["src/a.ts", "src/b.ts"],
      }),
    ).toMatchObject({
      candidateLabels: ["src/a.ts", "src/b.ts"],
      mutationAuthority: "not-granted",
      confirmationRequired: true,
    });
  });

  it("redacts private provider paths and secret-like values from labels", () => {
    const label = safeTargetLabel(
      "/home/wang/.private-agents-real/config token=secret api_key=abc Bearer xyz",
    );

    expect(label).not.toContain("/home/wang/.private-agents-real");
    expect(label).not.toContain("secret");
    expect(label).not.toContain("abc");
    expect(label).not.toContain("Bearer xyz");
    expect(label).toContain("[private-real-home]");
    expect(label).toContain("token=[redacted]");
  });
});
