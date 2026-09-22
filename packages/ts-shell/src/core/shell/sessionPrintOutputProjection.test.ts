import { describe, expect, it } from "vitest";
import type { CodingResultSummary } from "../../result/types.js";
import { selectPrintTerminalOutput } from "./sessionPrintOutputProjection.js";

describe("session print output projection", () => {
  it("keeps stopped sessions on stop reason unless final output is explicitly opted in", () => {
    expect(
      selectPrintTerminalOutput({
        finalOutput: "Detailed stopped output",
        terminalStatus: "stopped_error",
        terminalStopReason: "short stop reason",
        codingResult: codingResultWithEvidence([]),
      }),
    ).toBe("short stop reason");
  });

  it("renders stopped final output when a product path opts into print evidence", () => {
    expect(
      selectPrintTerminalOutput({
        finalOutput: "Detailed stopped output",
        terminalStatus: "stopped_error",
        terminalStopReason: "short stop reason",
        codingResult: codingResultWithEvidence([
          "session-print:stopped-final-output:include",
        ]),
      }),
    ).toBe("Detailed stopped output");
  });
});

function codingResultWithEvidence(evidence: readonly string[]): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [],
    patches: [],
    repair: {
      status: "not-needed",
      attempts: 1,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 1,
      evidence,
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
      reasons: [],
      requiredEvidence: [],
      observedEvidence: evidence,
    },
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "skipped",
    },
    evidence,
  };
}
