import { describe, expect, it } from "vitest";
import {
  buildApprovalDeniedResult,
  buildCompletedToolResult,
  buildExecutionFailedResult,
  buildPolicyBlockedResult,
  buildUnavailableResult,
  terminalSafeCapabilityLabel,
} from "./toolPolicyResult.js";

describe("tool policy/result contract", () => {
  it("maps command policy blocks to stopped without execution", () => {
    expect(
      buildPolicyBlockedResult({
        capability: "command",
        reasonCode: "command-not-allowlisted",
        reason: "Run-command intent is not allowed in the controlled allowlist: curl",
        doNext: "Use an allowlisted command.",
        evidence: ["actionable-blocker-kind:command-not-allowlisted"],
      }),
    ).toMatchObject({
      capability: "command",
      label: "command",
      availability: "available",
      policy: "blocked",
      execution: "not-run",
      result: "stopped",
      reasonCode: "command-not-allowlisted",
      doNext: "Use an allowlisted command.",
    });
  });

  it("keeps unavailable command and MCP tools distinct", () => {
    expect(
      buildUnavailableResult({
        capability: "command",
        reasonCode: "tool-unavailable",
        reason: "Tool 'missing-tool' is not registered",
      }),
    ).toMatchObject({
      capability: "command",
      availability: "unavailable",
      policy: "not-applicable",
      result: "stopped",
      reasonCode: "tool-unavailable",
    });

    expect(
      buildUnavailableResult({
        capability: "mcp",
        availability: "not-configured",
        reasonCode: "mcp-unavailable",
        reason: "MCP tool is not registered",
        doNext: "Run /mcp status and /mcp refresh.",
      }),
    ).toMatchObject({
      capability: "mcp",
      label: "MCP tool",
      availability: "not-configured",
      reasonCode: "mcp-unavailable",
    });
  });

  it("maps command success and failure into completed vs failed states", () => {
    expect(
      buildCompletedToolResult({
        capability: "command",
        reasonCode: "tool-succeeded",
        reason: "Command executed successfully: node --version",
      }),
    ).toMatchObject({
      policy: "allowed",
      execution: "succeeded",
      result: "completed",
    });

    expect(
      buildExecutionFailedResult({
        capability: "command",
        reason: "command failed",
      }),
    ).toMatchObject({
      policy: "allowed",
      execution: "failed",
      result: "failed",
      reasonCode: "tool-execution-failed",
    });
  });

  it("maps browser blocked and unavailable outcomes without broadening behavior", () => {
    expect(
      buildPolicyBlockedResult({
        capability: "browser",
        reasonCode: "policy-blocked",
        reason: "Public web automation is blocked.",
      }),
    ).toMatchObject({
      label: "browser tool",
      policy: "blocked",
      result: "stopped",
    });

    expect(
      buildUnavailableResult({
        capability: "browser",
        availability: "not-installed",
        reasonCode: "runtime-package-missing",
        reason: "Playwright runtime is unavailable.",
      }),
    ).toMatchObject({
      availability: "not-installed",
      policy: "not-applicable",
      execution: "not-run",
    });
  });

  it("maps edit missing target/content and provider not configured as stopped states", () => {
    expect(
      buildPolicyBlockedResult({
        capability: "edit",
        reasonCode: "write-target-missing",
        reason: "Target file is required.",
      }),
    ).toMatchObject({
      capability: "edit",
      result: "stopped",
      reasonCode: "write-target-missing",
    });

    expect(
      buildUnavailableResult({
        capability: "provider",
        availability: "not-configured",
        reasonCode: "provider-opt-in-required",
        reason: "Real provider path requires explicit opt-in.",
      }),
    ).toMatchObject({
      capability: "provider",
      availability: "not-configured",
      result: "stopped",
    });
  });

  it("keeps approval denied separate from execution failure", () => {
    expect(
      buildApprovalDeniedResult({
        capability: "command",
        reason: "Approval denied by user for bash",
      }),
    ).toMatchObject({
      policy: "approval-denied",
      execution: "not-run",
      result: "stopped",
      reasonCode: "approval-denied",
    });
  });

  it("provides terminal-safe labels for session-adjacent replay actions", () => {
    expect(terminalSafeCapabilityLabel("session")).toBe("session replay");
  });
});
