import { describe, expect, it } from "vitest";
import {
  createBrowserRuntimeStatusReceipt,
  createCommandRuntimeReceipt,
  createMcpRuntimeFailureReceipt,
  createSandboxPolicyRuntimeReceipt,
} from "./runtimeReceipt.js";

describe("runtime receipt", () => {
  it("maps command success into Route 146 result vocabulary", () => {
    const receipt = createCommandRuntimeReceipt({
      command: "printf ok",
      status: "completed",
      executionPath: "ts-local",
      exitCode: 0,
      stdout: "ok",
    });

    expect(receipt.runtimeKind).toBe("local-command");
    expect(receipt.execution).toBe("succeeded");
    expect(receipt.result).toBe("completed");
    expect(receipt.reasonCode).toBe("command-succeeded");
    expect(receipt.commandSummary).toBe("printf ok");
    expect(receipt.exitCode).toBe(0);
    expect(receipt.evidence).toContain("runtime-receipt:command:ts-local");
  });

  it("maps command failure and timeout without claiming completion", () => {
    const failed = createCommandRuntimeReceipt({
      command: "exit 2",
      status: "failed",
      executionPath: "ts-local",
      exitCode: 2,
      stderr: "bad",
    });
    const timedOut = createCommandRuntimeReceipt({
      command: "sleep 99",
      status: "timeout",
      executionPath: "ts-local",
      timeoutMs: 30_000,
    });

    expect(failed.execution).toBe("failed");
    expect(failed.result).toBe("failed");
    expect(failed.reasonCode).toBe("command-failed");
    expect(timedOut.execution).toBe("timed-out");
    expect(timedOut.result).toBe("failed");
    expect(timedOut.reasonCode).toBe("command-timed-out");
  });

  it("maps sandbox blocked and escalation facts without deciding policy", () => {
    const receipt = createSandboxPolicyRuntimeReceipt({
      toolName: "bash",
      operation: "process",
      target: "git status",
      allowed: false,
      reason: "Process spawn outside workspace: git",
      requiresEscalation: true,
      policyRule: "default-deny-process-spawn",
    });

    expect(receipt.runtimeKind).toBe("sandbox");
    expect(receipt.policy).toBe("requires-approval");
    expect(receipt.execution).toBe("not-run");
    expect(receipt.result).toBe("stopped");
    expect(receipt.reasonCode).toBe("sandbox-escalation-required");
    expect(receipt.evidence).toEqual(expect.arrayContaining([
      "runtime-receipt:sandbox-policy",
      "runtime-receipt:requires-escalation",
      "runtime-receipt:policy-rule:default-deny-process-spawn",
    ]));
  });

  it("maps browser unavailable and cleanup facts without browser expansion", () => {
    const receipt = createBrowserRuntimeStatusReceipt({
      status: "binary-missing",
      reasonCode: "runtime-binary-missing",
      reason: "No Chromium executable is present.",
      nextAction: "Install Chromium in the controlled local runtime.",
      cleanup: "not-started",
      evidence: ["pw-runtime:binary-missing", "pw-runtime:no-mcp-launch"],
    });

    expect(receipt.runtimeKind).toBe("browser");
    expect(receipt.availability).toBe("not-installed");
    expect(receipt.execution).toBe("not-run");
    expect(receipt.result).toBe("stopped");
    expect(receipt.cleanup).toBe("not-started");
    expect(receipt.evidence).toContain("pw-runtime:no-mcp-launch");
  });

  it("maps MCP protocol and process failures into runtime failure receipts", () => {
    const receipt = createMcpRuntimeFailureReceipt({
      serverName: "localSdk",
      toolName: "lookup",
      failureClass: "protocol",
      failurePlane: "protocol-level",
      safeDetail: "Invalid JSON-RPC response.",
      doNext: "Run /mcp status and refresh localSdk.",
      protocolFailure: true,
    });

    expect(receipt.runtimeKind).toBe("mcp-process");
    expect(receipt.execution).toBe("invalid-result");
    expect(receipt.result).toBe("failed");
    expect(receipt.reasonCode).toBe("mcp-protocol-failed");
    expect(receipt.targetSummary).toBe("localSdk/lookup");
  });
});
