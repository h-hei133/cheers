import { describe, expect, it } from "vitest";
import {
  buildWorkflowContinuationLineage,
  classifyWorkflowContinuationIntent,
  deriveWorkflowContinuationTarget,
  projectWorkflowLineageActivation,
} from "./continuationModule.js";
import {
  classifyReadInspectRequest,
  inferRepoDiagnosis,
  inferRepoEvidenceRole,
  isPathOnlyReadRequest,
  parseRepoCandidateFiles,
  projectReadMissingTargetStop,
  selectRepoExplainTarget,
} from "./readInspectModule.js";
import {
  planWorkflowVerification,
  projectSkippedWorkflowVerification,
  projectWorkflowVerificationEvidence,
  stripVerificationTailForTarget,
} from "./verificationModule.js";
import type { ContinuityStateLike } from "./runtimeHandoffProjection.js";

describe("agent loop module facades", () => {
  it("keeps read/inspect and workspace target decisions behind the read facade", () => {
    expect(classifyReadInspectRequest("read src/app.ts")).toMatchObject({
      hasFileReadIntent: true,
      hasTargetedFileReadIntent: true,
    });
    expect(isPathOnlyReadRequest("src/app.ts")).toBe(true);
    expect(parseRepoCandidateFiles("src/a.ts\n\nsrc/b.ts\n")).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(
      selectRepoExplainTarget({
        prompt: "explain app startup",
        candidates: [
          { path: "src/other.ts", content: "unrelated" },
          { path: "src/app.ts", content: "startup wiring" },
        ],
      }),
    ).toMatchObject({ path: "src/app.ts" });

    const stopped = projectReadMissingTargetStop({
      targetHint: "missing.ts",
    });
    expect(stopped).toMatchObject({
      result: "stopped",
      reasonCode: "missing-target",
    });
  });

  it("keeps verification planning and evidence projection behind the verification facade", () => {
    expect(stripVerificationTailForTarget("edit src/a.ts. then verify it")).toBe(
      "edit src/a.ts",
    );
    const plan = planWorkflowVerification({
      taskKind: "edit-file",
      prompt: "edit src/a.ts",
      changedFiles: ["docs/readme.md"],
      explicitVerifyRequested: false,
    });
    expect(plan.mode).toBe("skipped");

    const verification = projectSkippedWorkflowVerification(plan);
    expect(verification).toMatchObject({
      status: "skipped",
      selectionSource: "auto-from-changes",
    });
    expect(
      projectWorkflowVerificationEvidence({
        verification,
        workspaceRoot: "/tmp/workspace",
        targetPath: "docs/readme.md",
        verifyLikeCommand: false,
      }),
    ).toContain("verify-target-hint:docs/readme.md");
  });

  it("keeps continuation lineage redacted and projected behind the continuation facade", () => {
    const continuity: ContinuityStateLike = {
      lastTaskKind: "edit-file",
      recentTargetFiles: ["src/app.ts"],
      lastContinuationEvidence: [
        "continuation-lineage-active:src/app.ts::edit::old=>new",
        "token=secret",
        "/home/wang/.private-agents-real/config",
      ],
    };

    const intent = classifyWorkflowContinuationIntent({
      prompt: "continue",
      continuity,
    });
    const lineage = buildWorkflowContinuationLineage({ continuity });
    const activation = projectWorkflowLineageActivation({
      continuity,
      weakOrTemporalCue: true,
      selectedReopenTarget: "src/app.ts",
      reopenCandidates: ["src/app.ts"],
      crossFileSignal: true,
    });

    expect(intent.kind).not.toBe("none");
    expect(lineage.targetFiles).toEqual(["src/app.ts"]);
    expect(lineage.evidenceIds).not.toContain("token=secret");
    expect(lineage.evidenceIds).not.toContain(
      "/home/wang/.private-agents-real/config",
    );
    expect(activation.decision.status).toBe("activated");
    expect(activation.projection.evidence).toContain(
      "continuation-lineage-activation:same-file-slot",
    );
  });

  it("keeps repo diagnosis facts behind the read facade", () => {
    expect(inferRepoDiagnosis({ prompt: "why does this fail" })).toBe(
      "needs-verification",
    );
    expect(inferRepoEvidenceRole({ targetPath: "src/cli.ts" })).toBe(
      "entrypoint",
    );
  });

  it("rebases continuation targets through the continuation facade", () => {
    const target = deriveWorkflowContinuationTarget({
      continuity: {
        recentTargetFiles: [
          "packages/ts-shell/src/orchestration/continuationModule.ts",
        ],
      },
      workspaceRoot: process.cwd(),
    });

    expect(target).toBe(
      "packages/ts-shell/src/orchestration/continuationModule.ts",
    );
  });
});
