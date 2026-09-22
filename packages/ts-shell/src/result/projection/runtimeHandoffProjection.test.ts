import { describe, expect, it } from "vitest";
import {
  buildActionResultSeedDecisionTrace,
  buildPostEditVerifyContinuationLineage,
  hasPassedVerificationLineage,
  mergeContinuationState,
} from "./runtimeHandoffProjection.js";

describe("runtime handoff projection", () => {
  it("merges action-result seeds into mutation verification continuity", () => {
    const continuity = mergeContinuationState(
      {},
      {
        lastActionResultSeed: {
          actionKind: "edit-file",
          target: "./src/a.ts",
          changedFiles: ["src/a.ts"],
          verifiedFiles: ["src/a.ts"],
          verification: {
            status: "passed",
            command: "npm test -- --help",
            reason: "verify completed",
          },
        },
      },
    );

    expect(continuity.recentTargetFiles).toEqual(["src/a.ts"]);
    expect(continuity.recentChangedFiles).toEqual(["src/a.ts"]);
    expect(continuity.recentVerifiedFiles).toEqual(["src/a.ts"]);
    expect(continuity.lastVerificationStatus).toBe("passed");
    expect(continuity.lastVerificationCommand).toBe("npm test -- --help");
    expect(continuity.lastMutationVerificationLineage).toEqual({
      actionKind: "edit-file",
      changedFiles: ["src/a.ts"],
      verifiedFiles: ["src/a.ts"],
      verification: {
        status: "passed",
        command: "npm test -- --help",
        reason: "verify completed",
      },
    });
  });

  it("preserves structured continuity over inline seed fallback", () => {
    const continuity = mergeContinuationState(
      {
        recentChangedFiles: ["src/structured.ts"],
        lastVerificationStatus: "failed",
      },
      {
        lastActionResultSeed: {
          actionKind: "edit-file",
          target: "src/inline.ts",
          changedFiles: ["src/inline.ts"],
          verification: { status: "passed" },
        },
      },
    );

    expect(continuity.recentChangedFiles).toEqual(["src/structured.ts"]);
    expect(continuity.lastVerificationStatus).toBe("failed");
  });

  it("builds decision trace from action-result seed handoff facts", () => {
    expect(
      buildActionResultSeedDecisionTrace({
        lastActionResultSeed: {
          actionKind: "edit-file",
          target: ".\\src\\a.ts",
          changedFiles: ["src/a.ts"],
          verifiedFiles: ["src/a.ts"],
          writerStarted: true,
          writeEffect: "Verified",
          requiresUserInspection: true,
          verification: {
            status: "blocked",
            command: "npm test -- --help",
            blockerKind: "environment-not-ready",
          },
          reason: "verify blocked",
        },
      }),
    ).toEqual([
      "decision-trace: seed=action-result seedAction=edit-file seedTarget=src/a.ts seedChangedFiles=1 seedVerifiedFiles=1 seedWriterStarted=yes seedWriteEffect=verified seedRequiresUserInspection=yes seedVerifyStatus=blocked seedVerifyCommandInherited=yes seedBlocker=environment-not-ready seedReason=yes",
    ]);
  });

  it("projects post-edit verification lineage without changing changed-file counts", () => {
    expect(
      buildPostEditVerifyContinuationLineage({
        lastMutationVerificationLineage: {
          actionKind: "edit-file",
          changedFiles: ["src/a.ts", "src/b.ts"],
          verifiedFiles: ["src/a.ts"],
          verification: {
            status: "passed",
            command: "npm test -- --help",
          },
        },
      }),
    ).toEqual([
      "lineage=mutation-verification",
      "changedFiles=2",
      "verifiedFiles=1",
      "verifyStatus=passed",
      "verifyCommandInherited=yes",
    ]);
  });

  it("recognizes passed verification from lineage or continuity evidence", () => {
    expect(
      hasPassedVerificationLineage({
        recentChangedFiles: ["src/a.ts"],
        lastVerificationStatus: "passed",
      }),
    ).toBe(true);
    expect(
      hasPassedVerificationLineage({
        lastContinuationEvidence: ["verify-status:passed"],
      }),
    ).toBe(true);
  });
});
