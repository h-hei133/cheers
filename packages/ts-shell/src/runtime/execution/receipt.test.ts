import { describe, expect, it } from "vitest";

import { createCommandExecutionReceipt } from "./receipt.js";

describe("runtime execution receipt projection", () => {
  it("redacts unsafe command facts and remains evidence-only", () => {
    const receipt = createCommandExecutionReceipt({
      request: {
        operationKind: "command.run",
        command: "sh",
        args: ["-c", "printf secret"],
        cwd: "/workspace",
        workspaceRoot: "/workspace",
        authority: {
          mode: "command-allowlisted",
          source: "tool-runtime-approval",
          reason: "test authority",
        },
        caller: "core-tool:bash",
        reason: "test receipt",
        reportSafeCommand: "printf token=secret-value oldText=raw-before",
      },
      result: {
        status: "failed",
        exitCode: 2,
        stdout: "raw provider output: hidden reasoning sk-1234567890",
        stderr: "Authorization: Bearer abc /home/wang/.private-agents-real/config.json",
      },
    });
    const serialized = JSON.stringify(receipt);

    expect(receipt.executionStatus).toBe("failure");
    expect(receipt.errorClass).toBe("command_failed");
    expect(receipt.notProvenClaims).toContain("terminal-task-success");
    expect(receipt.redaction.status).toBe("redacted");
    expect(serialized).not.toMatch(/secret-value|raw-before|hidden reasoning|sk-1234567890|Bearer abc|cheers-real/);
    expect(serialized).toContain("[secret-redacted]");
  });

  it("carries before-tool authority metadata without claiming terminal success", () => {
    const receipt = createCommandExecutionReceipt({
      request: {
        operationKind: "command.run",
        command: "sh",
        args: ["-c", "printf ok"],
        cwd: "/workspace",
        workspaceRoot: "/workspace",
        authority: {
          mode: "command-allowlisted",
          source: "tool-runtime-approval",
          reason: "test authority",
        },
        caller: "core-tool:bash",
        reason: "test receipt",
        reportSafeCommand: "printf ok",
        policy: {
          decisionId: "tool-policy-decision:test",
          decisionStatus: "allow",
          policySource: "tool-runtime-approval",
          authorityRequirement: "command-allowlisted",
          redactionStatus: "report-safe",
          reportSafeSummary: "printf ok",
          terminalSuccessClaim: false,
          notProvenClaims: ["terminal-success", "tool-success"],
        },
      },
      result: {
        status: "completed",
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      },
    });

    expect(receipt.policy).toMatchObject({
      decisionStatus: "allow",
      authorityRequirement: "command-allowlisted",
      terminalSuccessClaim: false,
    });
    expect(receipt.notProvenClaims).toEqual(
      expect.arrayContaining(["terminal-success", "tool-success"]),
    );
    expect(JSON.stringify(receipt)).not.toContain('"success":true');
  });
});
