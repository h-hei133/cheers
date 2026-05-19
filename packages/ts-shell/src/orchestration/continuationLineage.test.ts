import { describe, expect, it } from "vitest";
import {
  buildReplaySafeContinuationLineage,
  decideLineageActivation,
} from "./continuationLineage.js";
import { classifyContinuationIntent } from "./continuationIntent.js";
import { projectReplaySafeContinuationSummary } from "./continuationProjection.js";
import { resolveContinuationRebase } from "./continuationRebase.js";

describe("continuation lineage contract", () => {
  it("classifies explicit continue, weak follow-up, temporal successor, and unrelated tasks", () => {
    expect(classifyContinuationIntent({ prompt: "/continue" }).kind).toBe(
      "explicit-continue",
    );
    expect(
      classifyContinuationIntent({
        prompt: "keep going",
        continuity: { recentTargetFiles: ["src/app.ts"] },
      }).kind,
    ).toBe("weak-follow-up");
    expect(
      classifyContinuationIntent({
        prompt: "what next",
        continuity: { lastContinuationEvidence: ["next-action:repair"] },
      }).kind,
    ).toBe("next-step");
    expect(classifyContinuationIntent({ prompt: "explain promises" }).kind).toBe(
      "unrelated-new-task",
    );
  });

  it("classifies reopen, rebase, and retry continuation intents without tools", () => {
    expect(
      classifyContinuationIntent({
        prompt: "reopen the previous file",
        continuity: { recentTargetFiles: ["src/app.ts"] },
      }).kind,
    ).toBe("reopen-previous-target");
    expect(
      classifyContinuationIntent({
        prompt: "after migration, continue in the new root",
        continuity: { recentTargetFiles: ["D:/old/src/app.ts"] },
      }).kind,
    ).toBe("rebase-request");
    expect(
      classifyContinuationIntent({
        prompt: "why did it stop",
        continuity: { lastFailure: "stopped" },
      }).kind,
    ).toBe("retry-after-failure");
  });

  it("builds replay-safe evidence and filters raw content or secrets", () => {
    const lineage = buildReplaySafeContinuationLineage({
      continuity: {
        lastTaskKind: "edit-file",
        recentTargetFiles: ["src/app.ts"],
        lastTerminalClassification: "stopped",
        lastVerificationStatus: "blocked",
        lastVerificationCommand: "node --version",
        lastContinuationEvidence: [
          "verify-command-hint:node --version",
          "raw-dom:<html>secret</html>",
          "token:abc123",
        ],
      },
    });

    expect(lineage.targetFiles).toEqual(["src/app.ts"]);
    expect(lineage.evidenceIds).toEqual(["verify-command-hint:node --version"]);
    expect(lineage.verificationHint?.command).toBe("node --version");
  });

  it("activates weak same-file lineage when one edit slot is active", () => {
    const decision = decideLineageActivation({
      weakOrTemporalCue: true,
      continuity: {
        lastContinuationEvidence: [
          "continuation-lineage-active:src/app.ts::edit::old=>new",
          "continuation-lineage-slot:src/app.ts::edit::old=>new",
        ],
      },
    });

    expect(decision.status).toBe("activated");
    expect(decision.evidence).toContain(
      "continuation-lineage-activation:same-file-slot",
    );
  });

  it("stops weak same-file lineage when slots are ambiguous", () => {
    const decision = decideLineageActivation({
      weakOrTemporalCue: true,
      continuity: {
        lastContinuationEvidence: [
          "continuation-lineage-active:src/app.ts::edit::old=>new",
          "continuation-lineage-slot:src/app.ts::edit::old=>new",
          "continuation-lineage-slot:src/app.ts::read::*",
        ],
      },
    });

    expect(decision.status).toBe("blocked");
    expect(decision.reason).toContain("ambiguous across multiple subtask slots");
  });

  it("activates or blocks cross-file reopen only when candidate evidence is deterministic", () => {
    expect(
      decideLineageActivation({
        weakOrTemporalCue: true,
        continuity: {},
        selectedReopenTarget: "src/a.ts",
        reopenCandidates: ["src/a.ts"],
        crossFileSignal: true,
      }).evidence,
    ).toContain("continuation-lineage-activation:cross-file-candidate");

    expect(
      decideLineageActivation({
        weakOrTemporalCue: true,
        continuity: {},
        reopenCandidates: ["src/a.ts", "src/b.ts"],
        crossFileSignal: true,
      }).reason,
    ).toContain("multiple candidate targets");
  });

  it("carries verification hints only inside the same lineage facts", () => {
    const related = buildReplaySafeContinuationLineage({
      continuity: {
        recentTargetFiles: ["src/app.ts"],
        lastVerificationStatus: "blocked",
        lastVerificationCommand: "npm test -- --help",
      },
    });
    const unrelated = buildReplaySafeContinuationLineage({
      continuity: { recentTargetFiles: ["src/other.ts"] },
    });

    expect(related.verificationHint?.command).toBe("npm test -- --help");
    expect(unrelated.verificationHint).toBeUndefined();
  });

  it("carries safe next-action hints while filtering unsafe target lineage", () => {
    const lineage = buildReplaySafeContinuationLineage({
      continuity: {
        recentTargetFiles: [
          "src/app.ts",
          "/home/wang/.private-agents-real/provider.env",
        ],
        lastVerificationNextAction: "repair src/app.ts with explicit transform",
      },
    });

    expect(lineage.targetFiles).toEqual(["src/app.ts"]);
    expect(lineage.safeNextActionHint).toBe(
      "repair src/app.ts with explicit transform",
    );
  });

  it("rebases deterministic workspace targets and stops missing or ambiguous targets", () => {
    expect(
      resolveContinuationRebase({
        priorPath: "D:/old/src/app.ts",
        workspaceRoot: process.cwd(),
        candidates: ["src/app.ts"],
      }),
    ).toMatchObject({ status: "rebased", targetPath: "src/app.ts" });

    expect(
      resolveContinuationRebase({
        priorPath: "D:/old/src/app.ts",
        workspaceRoot: process.cwd(),
      }).status,
    ).toBe("missing");

    expect(
      resolveContinuationRebase({
        priorPath: "D:/old/src/app.ts",
        workspaceRoot: process.cwd(),
        candidates: ["src/a.ts", "src/b.ts"],
      }).status,
    ).toBe("ambiguous");
  });

  it("projects transcript-safe continuation summary without raw file content", () => {
    const projection = projectReplaySafeContinuationSummary({
      targetFiles: ["src/app.ts", "/home/wang/.private-agents-real/env"],
      evidenceIds: [
        "verify-command-hint:node --version",
        "raw-dom:<html>secret</html>",
      ],
      verificationCommand: "node --version --token abc",
    });

    expect(projection.summary).toContain("src/app.ts");
    expect(projection.evidence.join("\n")).not.toContain("<html>");
    expect(projection.evidence.join("\n")).not.toContain("secret");
    expect(projection.evidence.join("\n")).not.toContain("private-agents-real");
    expect(projection.evidence.join("\n")).not.toContain("token");
  });
});
