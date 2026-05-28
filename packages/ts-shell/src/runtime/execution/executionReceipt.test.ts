import { describe, expect, it } from "vitest";

import { createCommandExecutionReceipt } from "./executionReceipt.js";

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
    expect(serialized).not.toMatch(/secret-value|raw-before|hidden reasoning|sk-1234567890|Bearer abc|private-agents-real/);
    expect(serialized).toContain("[secret-redacted]");
  });
});
