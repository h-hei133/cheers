import { describe, expect, it } from "vitest";
import { evaluateBrowserExecutionReceiptAssertion } from "./browserExecutionReceiptAssertions.js";
import type { AgentCliProcessResult } from "./agentCliScenarioModel.js";
import { captureCliOutput } from "./agentCliScenarioModel.js";

describe("browser execution receipt assertions", () => {
  it("checks receipt status, replay readiness, safety, decisions, and next action", () => {
    const process = processResult([
      "Browser execution receipt",
      "- Receipt id: browser-receipt:fixture",
      "- Status: executed",
      "- Action: observe",
      "- Mode: test-local",
      "- Runner: runner:route104 (cli-harness)",
      "- Evidence summary: Observed safe summary.",
      "- Replay readiness: replay-ready",
      "- Redactions/warnings: raw-content",
      "- Executed: yes",
      "- Next action: Receipt is replay-ready for a future explicit replay route; no replay is executed here.",
      "Browser sandbox",
      "- Sandbox authority: allowed",
      "- Network allowlist: allowed",
      "- Confirmation status: not-required",
    ].join("\n"));

    for (const assertion of [
      { id: "exists", kind: "browser-receipt-exists" as const },
      { id: "status", kind: "browser-receipt-status" as const, text: "executed" },
      { id: "executed", kind: "browser-receipt-executed" as const, text: "yes" },
      { id: "replay", kind: "browser-receipt-replay-readiness" as const, text: "replay-ready" },
      { id: "safe", kind: "browser-receipt-safe" as const },
      { id: "decisions", kind: "browser-receipt-decisions" as const },
      { id: "local", kind: "browser-receipt-local-test-scoped" as const },
      { id: "next", kind: "browser-receipt-next-action" as const },
    ]) {
      expect(evaluateBrowserExecutionReceiptAssertion({ assertion, process }).status).toBe("passed");
    }
  });
});

function processResult(output: string): AgentCliProcessResult {
  return {
    spec: {
      command: "private-agents",
      args: [],
      cwd: "/tmp/project",
      timeoutMs: 1000,
      promptSummary: "/browser execute observe",
    },
    exitCode: 0,
    signal: null,
    timedOut: false,
    durationMs: 1,
    output: captureCliOutput({ stdout: output, stderr: "" }),
    evidence: [],
    warnings: [],
    redactions: [],
  };
}
