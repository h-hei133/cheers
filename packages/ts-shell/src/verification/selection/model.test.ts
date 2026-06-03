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
});
