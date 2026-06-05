import { describe, expect, it } from "vitest";

import { selectVerification } from "./model.js";

describe("verification selection model", () => {
  it("selects code edit verification and allows proof input only after a passed check", () => {
    const selection = selectVerification({
      taskKind: "coding-edit",
      taskPath: "edit",
      expectedStatus: "passed",
      expectedCheck: "focused test",
      hostEvidenceVerdict: "complete",
      hostStatus: "complete",
      failureCategories: [],
    });

    expect(selection).toMatchObject({
      purpose: "code-edit",
      state: "selected-passed",
      selected: true,
      evidenceInputEligible: true,
      resultInputEligible: true,
      terminalSuccessClaim: false,
    });
    expect(selection.proves).toContain("changed code satisfies the selected check");
    expect(selection.doesNotProve).toContain("provider output");
  });

  it("keeps selected but failed, blocked, insufficient, and missing selections non-success", () => {
    expect(selectVerification({
      taskKind: "debug-repair",
      taskPath: "edit",
      expectedStatus: "failed",
      expectedCheck: "post repair test",
      hostEvidenceVerdict: "not-proven",
      hostStatus: "failed",
      failureCategories: ["verification failed"],
    }).state).toBe("selected-failed");

    expect(selectVerification({
      taskKind: "workspace-understanding",
      taskPath: "tool",
      expectedStatus: "blocked",
      expectedCheck: "context check",
      hostEvidenceVerdict: "not-proven",
      hostStatus: "blocked",
      failureCategories: [],
    }).state).toBe("selected-blocked");

    expect(selectVerification({
      taskKind: "debug-repair",
      taskPath: "edit",
      expectedStatus: "partial",
      expectedCheck: "partial repair check",
      hostEvidenceVerdict: "not-proven",
      hostStatus: "partial",
      failureCategories: [],
    }).state).toBe("insufficient");

    expect(selectVerification({
      taskKind: "docs-report",
      taskPath: "artifact",
      expectedStatus: "passed",
      expectedCheck: "source check",
      hostEvidenceVerdict: "not-proven",
      hostStatus: "not-proven",
      failureCategories: ["verification not selected"],
    }).state).toBe("not-selected");
  });

  it("keeps contradictory verification failure categories from becoming result input", () => {
    const selection = selectVerification({
      taskKind: "coding-edit",
      taskPath: "edit",
      expectedStatus: "passed",
      expectedCheck: "focused test",
      hostEvidenceVerdict: "complete",
      hostStatus: "complete",
      failureCategories: ["verification failed"],
    });

    expect(selection).toMatchObject({
      state: "selected-failed",
      evidenceInputEligible: false,
      resultInputEligible: false,
      terminalSuccessClaim: false,
    });
    expect(selection.blockers).toContain("verification failed");
    expect(selection.proves).toEqual([]);
  });

  it("selects verification from task intent, changed files, and failure history", () => {
    const selection = selectVerification({
      taskKind: "coding-edit",
      taskPath: "edit",
      taskIntent: "repair payment status consumer after failed test",
      changedFiles: ["src/payments/status.ts", "src/payments/statusConsumer.ts"],
      expectedStatus: "failed",
      expectedCheck: "focused payment status test",
      hostEvidenceVerdict: "not-proven",
      hostStatus: "failed",
      failureCategories: [],
      proofGap: ["changed files need verification proof"],
      failureHistory: [{
        command: "npm test -- statusConsumer.test.ts",
        status: "failed",
        changedFiles: ["src/payments/statusConsumer.ts"],
        reason: "consumer still imports stale status name",
      }],
    });

    expect(selection).toMatchObject({
      purpose: "code-edit",
      state: "selected-failed",
      rerunReason: "changed files need task-relevant verification",
      selectedInputs: {
        taskIntent: "repair payment status consumer after failed test",
        changedFiles: ["src/payments/status.ts", "src/payments/statusConsumer.ts"],
        failureHistoryUsed: true,
        proofGap: ["changed files need verification proof"],
      },
      evidenceInputEligible: false,
      resultInputEligible: false,
    });
    expect(selection.blockers).toContain(
      "previous failed verification: consumer still imports stale status name",
    );
    expect(selection.fallback).toBe("diagnose failure before bounded repair");
  });

  it("selects a not-run targeted check when changed files leave a proof gap", () => {
    const selection = selectVerification({
      taskKind: "coding-edit",
      taskPath: "edit",
      taskIntent: "update parser branch",
      changedFiles: ["src/parser.ts"],
      proofGap: ["changed target proof missing"],
      expectedStatus: "not-run",
      expectedCheck: "parser focused test",
      hostEvidenceVerdict: "not-proven",
      hostStatus: "partial",
      failureCategories: [],
    });

    expect(selection).toMatchObject({
      state: "selected-not-run",
      rerunReason: "changed files need task-relevant verification",
      evidenceInputEligible: false,
      resultInputEligible: false,
    });
    expect(selection.selectedInputs.changedFiles).toEqual(["src/parser.ts"]);
  });
});
