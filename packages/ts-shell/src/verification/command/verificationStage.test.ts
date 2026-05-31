import { describe, expect, it } from "vitest";

import { runCommandVerificationStage } from "./verificationStage.js";

describe("commandVerificationStage", () => {
  it("does not upgrade approval-denied verification to success", async () => {
    const result = await runCommandVerificationStage({
      plan: {
        mode: "command",
        command: "node --version",
        reason: "explicit verify command selected",
        selectionScope: "focused",
        selectionSource: "explicit-user",
        maxAttempts: 2,
      },
      changedFiles: ["src/a.ts"],
      dispatcher: {
        async dispatch() {
          return {
            success: false,
            error: "approval denied",
            metadata: { wasEscalated: true },
          };
        },
      } as never,
      events: [],
      sessionId: "s",
      turn: 1,
      workspaceRoot: "/tmp/workspace",
      provenanceCollector: { approvalDecisions: [], toolExecutions: [] },
    });

    expect(result.verification.status).toBe("blocked");
    expect(result.verification.blockerKind).toBe("approval-denied");
    expect(result.verifiedFiles).toEqual([]);
    expect(result.unverifiedFiles).toEqual([
      { path: "src/a.ts", reason: "approval denied" },
    ]);
    expect(result.repairNotes.join("\n")).toContain("verify blocked after edit");
  });

  it("records retry evidence without marking failed first attempt as success", async () => {
    let attempt = 0;
    const result = await runCommandVerificationStage({
      plan: {
        mode: "command",
        command: "node --version",
        reason: "explicit verify command selected",
        selectionScope: "focused",
        selectionSource: "explicit-user",
        maxAttempts: 2,
      },
      changedFiles: ["src/a.ts"],
      dispatcher: {
        async dispatch() {
          attempt += 1;
          return attempt === 1
            ? { success: false, error: "test failed" }
            : { success: true, output: "v20.0.0" };
        },
      } as never,
      events: [],
      sessionId: "s",
      turn: 1,
      workspaceRoot: "/tmp/workspace",
      provenanceCollector: { approvalDecisions: [], toolExecutions: [] },
    });

    expect(result.verification.status).toBe("passed");
    expect(result.verifiedFiles).toEqual(["src/a.ts"]);
    expect(result.evidence).toContain(
      "verify-retry:retry-planned:command-failed-retryable",
    );
  });
});
