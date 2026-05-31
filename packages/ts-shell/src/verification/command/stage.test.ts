import { describe, expect, it } from "vitest";

import { runDirectCommandStage } from "./stage.js";

describe("commandStage", () => {
  it("keeps blocked direct commands skipped instead of success", async () => {
    const failedFiles: Array<{ path: string; reason: string }> = [];
    const evidence: string[] = [];
    const result = await runDirectCommandStage({
      plan: {
        taskKind: "run-command",
        directCommand: "curl https://example.com",
        blockedReason: "Command is not allowlisted.",
      } as never,
      dispatcher: {} as never,
      events: [],
      sessionId: "s",
      turn: 1,
      workspaceRoot: "/tmp/workspace",
      provenanceCollector: {
        approvalDecisions: [],
        toolExecutions: [],
      },
      notes: [],
      evidence,
      failedFiles,
    });

    expect(result.verification.status).toBe("skipped");
    expect(result.dispatchedRunCommand).toBe("curl https://example.com");
    expect(failedFiles).toEqual([
      { path: "(command)", reason: "Command is not allowlisted." },
    ]);
    expect(evidence.some((entry) => entry.includes("verification-command"))).toBe(true);
  });
});
