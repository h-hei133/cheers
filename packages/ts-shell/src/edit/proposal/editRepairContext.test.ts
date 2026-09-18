import { describe, expect, it } from "vitest";
import {
  buildEditRepairContext,
  buildEditRepairContextFromCodingResult,
} from "./editRepairContext.js";
import type { CodingResultSummary } from "../../result/types.js";

describe("editRepairContext", () => {
  it("creates redacted safe context from failed verification facts", () => {
    const context = buildEditRepairContext({
      sourceTransactionId: "txn-123",
      sourceProposalId: "proposal-123",
      verification: {
        status: "failed",
        command: "npm test -- token=abc123",
        reason:
          "Verification failed with api_key=secret and /home/wang/.private-agents-real/config.env",
        nextAction: "Inspect failure and retry.",
      },
      failedFiles: [{ path: "/repo/src/app.ts", reason: "test failed" }],
      changedFiles: ["/repo/src/app.ts"],
      failedHunks: [
        {
          hunkId: "h1",
          targetPath: "/repo/src/app.ts",
          operationSummary: "repair oldName => newName",
          failureSummary: "assertion failed with Bearer token-value",
        },
      ],
      runtimeReceiptMarkers: ["runtime-receipt-local-command:failed"],
    });

    expect(context.status).toBe("repair-context-created");
    expect(context.failedVerificationSummary.reason).toContain(
      "api_key=[redacted]",
    );
    expect(context.failedVerificationSummary.reason).not.toContain("secret");
    expect(context.failedVerificationSummary.reason).not.toContain(
      ".private-agents-real",
    );
    expect(JSON.stringify(context)).not.toContain("token-value");
    expect(context.evidence).toEqual(
      expect.arrayContaining([
        "edit-repair-context:mutation:not-run",
        "edit-repair-context:raw-content-excluded",
        "edit-repair-context:provider-config-excluded",
      ]),
    );
  });

  it("classifies not-needed and over-budget contexts without provider facts", () => {
    const notNeeded = buildEditRepairContext({
      verification: { status: "passed" },
      changedFiles: ["src/app.ts"],
    });
    const overBudget = buildEditRepairContext({
      verification: { status: "failed", reason: "too many files" },
      failedFiles: [{ path: "a.ts" }, { path: "b.ts" }],
      maxFiles: 1,
    });

    expect(notNeeded.status).toBe("repair-not-needed");
    expect(overBudget.status).toBe("repair-context-over-budget");
  });

  it("derives context from coding results without raw continuation leakage", () => {
    const codingResult = makeCodingResult({
      changedFiles: ["src/app.ts"],
      failedFiles: [{ path: "src/app.ts", reason: "verification failed" }],
      verification: {
        status: "failed",
        reason: "Assertion failed token=hidden",
        command: "npm test",
      },
      evidence: ["runtime-receipt-local-command:failed"],
    });

    const context = buildEditRepairContextFromCodingResult({
      codingResult,
      sourceTransactionId: "txn-456",
    });

    expect(context.status).toBe("repair-context-created");
    expect(context.runtimeReceiptMarkers).toEqual([
      "runtime-receipt-local-command:failed",
    ]);
    expect(JSON.stringify(context)).not.toContain("hidden");
  });
});

function makeCodingResult(
  overrides: Partial<CodingResultSummary> = {},
): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [],
    patches: [],
    repair: { status: "failed", attempts: 0, recoveredItems: [], failedItems: [], notes: [] },
    continuation: { status: "failed-after-bounded-continuation", attempts: 0, evidence: [] },
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
      observedEvidence: [],
    },
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: { status: "blocked", reason: "blocked", blockerKind: "unknown" },
    evidence: [],
    ...overrides,
  };
}
