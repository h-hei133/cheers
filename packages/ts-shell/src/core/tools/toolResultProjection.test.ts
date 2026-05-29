import { describe, expect, it } from "vitest";
import {
  buildApprovalDeniedResult,
  buildExecutionFailedResult,
  buildPolicyBlockedResult,
} from "./toolPolicyResult.js";
import { projectToolResult, sanitizeToolResultText } from "./toolResultProjection.js";

describe("tool result projection", () => {
  it("projects transcript-safe summaries with reason and do-next", () => {
    const projected = projectToolResult(
      buildPolicyBlockedResult({
        capability: "command",
        reasonCode: "command-not-allowlisted",
        reason: "Run-command intent is not allowed in the controlled allowlist: curl",
        doNext: "Use an allowlisted command.",
        evidence: ["actionable-blocker-kind:command-not-allowlisted"],
      }),
    );

    expect(projected.resultSummary).toContain("command:stopped:command-not-allowlisted");
    expect(projected.terminalSummary).toContain("DoNext: Use an allowlisted command.");
    expect(projected.evidenceSummary).toEqual([
      "actionable-blocker-kind:command-not-allowlisted",
    ]);
    expect(projected.redactionStatus).toBe("clean");
  });

  it("redacts raw DOM, secrets, cookies, auth headers, and provider paths", () => {
    const projected = projectToolResult(
      buildExecutionFailedResult({
        capability: "browser",
        reason:
          "<html><body>token=abc cookie=value Authorization: Bearer xyz raw DOM /home/wang/.private-agents-real/config.json</body></html>",
        doNext: "Do not retry with api_key=abc123.",
        evidence: ["document.cookie=secret", "-----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----"],
      }),
    );

    const joined = [
      projected.resultSummary,
      projected.terminalSummary,
      projected.transcriptSummary,
      ...projected.evidenceSummary,
    ].join("\n");
    expect(joined).not.toMatch(/abc123|Bearer xyz|cookie=value|document\.cookie|private-agents-real|PRIVATE KEY|<html/i);
    expect(joined).toContain("[raw-content-excluded]");
    expect(projected.redactionStatus).toBe("redacted");
  });

  it("keeps approval denied replay summaries concise and stopped", () => {
    const projected = projectToolResult(
      buildApprovalDeniedResult({
        capability: "command",
        reason: "Approval denied by user for bash",
        doNext: "Re-run and approve escalation for verify command execution.",
      }),
    );

    expect(projected.transcriptSummary).toContain("command:stopped:approval-denied");
    expect(projected.terminalSummary).toContain("Approval denied by user for bash");
  });

  it("sanitizes long raw file dumps without exposing the full body", () => {
    const longDump = Array.from({ length: 60 }, (_, index) => `line ${index}`).join("\n");
    expect(sanitizeToolResultText(longDump)).toContain("[long-output-excluded]");
  });
});
