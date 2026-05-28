import { describe, expect, it } from "vitest";

import { classifyCommandExecutionOutcome } from "./executionErrorTaxonomy.js";

describe("execution error taxonomy", () => {
  it("classifies distinct command execution failures without collapsing to generic error", () => {
    const base = {
      status: "failed" as const,
      exitCode: 1,
      authorityMode: "command-allowlisted" as const,
    };

    expect(classifyCommandExecutionOutcome({
      ...base,
      stderr: "exit 7",
    }).errorClass).toBe("command_failed");
    expect(classifyCommandExecutionOutcome({
      ...base,
      failureKind: "sandbox_preflight",
      stderr: "Network access requires escalation",
    }).errorClass).toBe("policy_blocked");
    expect(classifyCommandExecutionOutcome({
      ...base,
      stderr: "spawn missing ENOENT",
    }).errorClass).toBe("command_unavailable");
    expect(classifyCommandExecutionOutcome({
      ...base,
      stderr: "EACCES permission denied",
    }).errorClass).toBe("permission_denied");
    expect(classifyCommandExecutionOutcome({
      status: "timeout",
      exitCode: null,
      authorityMode: "command-allowlisted",
    }).errorClass).toBe("timeout");
    expect(classifyCommandExecutionOutcome({
      status: "cancelled",
      exitCode: null,
      authorityMode: "command-allowlisted",
    }).errorClass).toBe("cancelled");
  });
});
