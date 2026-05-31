import { describe, expect, it } from "vitest";

import { runLowRiskVerificationStage } from "./lowRisk.js";

describe("lowRiskVerificationStage", () => {
  it("passes content readback only when every changed file contains expected text", async () => {
    const result = await runLowRiskVerificationStage({
      prompt: "Edit src/a.txt and verify contains modern.",
      changedFiles: ["src/a.txt"],
      unchangedAssertions: [],
      appliedContentByPath: new Map(),
      protectedSnapshots: new Map(),
      patches: [],
      dispatcher: dispatcherWithReads({ "src/a.txt": "modern\n" }),
      events: [],
      sessionId: "s",
      turn: 1,
      workspaceRoot: "/tmp/workspace",
    });

    expect(result.verification.status).toBe("passed");
    expect(result.verifiedFiles).toEqual(["src/a.txt"]);
    expect(result.unverifiedFiles).toEqual([]);
    expect(result.evidence).toContain("verify-content-contains:src/a.txt:modern");
  });

  it("keeps changed files unverified when readback is blocked", async () => {
    const result = await runLowRiskVerificationStage({
      prompt: "Edit src/a.txt and verify contains modern.",
      changedFiles: ["src/a.txt"],
      unchangedAssertions: [],
      appliedContentByPath: new Map(),
      protectedSnapshots: new Map(),
      patches: [],
      dispatcher: {
        async dispatch() {
          return { success: false, error: "read denied" };
        },
      } as never,
      events: [],
      sessionId: "s",
      turn: 1,
      workspaceRoot: "/tmp/workspace",
    });

    expect(result.verification.status).toBe("blocked");
    expect(result.verifiedFiles).toEqual([]);
    expect(result.unverifiedFiles).toEqual([
      { path: "src/a.txt", reason: "read denied" },
    ]);
  });
});

function dispatcherWithReads(reads: Record<string, string>) {
  return {
    async dispatch(_toolName: string, args: Record<string, unknown>) {
      const path = String(args.path ?? "");
      if (Object.hasOwn(reads, path)) {
        return { success: true, output: reads[path] };
      }
      return { success: false, error: `missing ${path}` };
    },
  } as never;
}
