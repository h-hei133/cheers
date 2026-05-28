import { describe, expect, it } from "vitest";

import { projectApprovalAuditMemoryState } from "./cliApprovalAuditBridge.js";

describe("CLI approval audit bridge", () => {
  it("preserves audit memory keys and whitelists report-safe input keys", () => {
    expect(
      projectApprovalAuditMemoryState({
        channel: "interactive",
        decision: "allow-once",
        decisionSource: "interactive-keypress",
        persistent: false,
        cacheEffect: "none",
        projectRoot: "/repo",
        cacheKey: "cache-key",
        scopeLabel: "shell:execute:npm-test",
        lineage: "blocked-verify-resume",
        inputKey: "a",
      }),
    ).toEqual({
      channel: "interactive",
      decision: "allow-once",
      decisionSource: "interactive-keypress",
      persistent: false,
      cacheEffect: "none",
      projectRoot: "/repo",
      cacheKey: "cache-key",
      scopeLabel: "shell:execute:npm-test",
      lineage: "blocked-verify-resume",
      inputKey: "a",
    });

    expect(
      projectApprovalAuditMemoryState({
        decision: "deny",
        decisionSource: "default-deny",
        persistent: false,
        cacheEffect: "none",
        projectRoot: "/repo",
        cacheKey: "cache-key",
        scopeLabel: "shell:execute:npm-test",
        inputKey: undefined,
      }),
    ).not.toHaveProperty("inputKey");
  });
});
