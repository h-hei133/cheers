import { describe, expect, it } from "vitest";
import type { CodingResultSummary } from "../result/types.js";
import { projectSessionResultParity } from "./sessionResultParity.js";

describe("session result parity", () => {
  it("keeps approval-denied reason distinct from do-next guidance", () => {
    const projection = projectSessionResultParity({
      terminalClassification: "stopped",
      stopReason: "Re-run and approve escalation for verify command execution.",
      codingResult: makeCodingResult({
        reason: "Approval denied by user for bash",
        nextAction: "Re-run and approve escalation for verify command execution.",
        evidence: ["actionable-blocker-kind:approval-denied"],
      }),
    });

    expect(projection.blockerKind).toBe("approval-denied");
    expect(projection.reason).toBe("Approval denied by user for bash");
    expect(projection.doNext).toBe(
      "Re-run and approve escalation for verify command execution.",
    );
  });

  it("projects a current stop reason without a legacy coding result", () => {
    expect(projectSessionResultParity({
      terminalClassification: "stopped",
      stopReason: "User denied permission for tool bash",
    })).toMatchObject({
      terminalClassification: "stopped",
      blockerKind: "approval-denied",
      reason: "User denied permission for tool bash",
      doNext: expect.stringContaining("approve"),
    });
  });

  it("does not turn unproduced evidence prefixes into authority or capability facts", () => {
    const projection = projectSessionResultParity({
      terminalClassification: "stopped",
      codingResult: makeCodingResult({
        reason: "Review required", nextAction: "Review the requested change.",
        evidence: ["context-packet ctx; mutationAuthority=not-granted", "claim-ledger:terminal:confirmation-required"],
      }),
    });
    expect(projection).toEqual({
      terminalClassification: "stopped", reason: "Review required", doNext: "Review the requested change.",
    });
  });

});

function makeCodingResult(input: {
  readonly reason: string;
  readonly nextAction?: string;
  readonly evidence: readonly string[];
}): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [{ path: "(session parity)", reason: input.reason }],
    patches: [],
    repair: {
      status: "failed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "failed-after-bounded-continuation",
      attempts: 1,
      evidence: [...input.evidence],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: [input.reason],
      requiredEvidence: [],
      observedEvidence: [...input.evidence],
    },
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "blocked",
      reason: input.reason,
      blockerKind: "unknown",
      ...(input.nextAction ? { nextAction: input.nextAction } : {}),
    },
    evidence: [...input.evidence],
  };
}
