import { describe, expect, it } from "vitest";
import { createCommandRuntimeReceipt } from "../core/runtime/runtimeReceipt.js";
import { projectRuntimeReceipt } from "../core/runtime/runtimeReceiptProjection.js";
import type { ToolLifecycleResult } from "./flowDispatch.js";
import {
  buildVerificationCommandResult,
  buildVerificationCommandSurfaceResult,
} from "./verificationCommandResult.js";
import { buildVerificationCommandPlan } from "../verification/command/plan.js";

describe("verificationCommandResult", () => {
  it("projects successful command verification with receipt markers", () => {
    const plan = buildVerificationCommandPlan({ explicitCommand: "node --version" });
    const result = buildVerificationCommandResult({
      plan,
      result: toolResult({ success: true, stdout: "v20.0.0" }),
    });

    expect(result.outcome).toBe("success");
    expect(result.verification.status).toBe("passed");
    expect(result.runtimeReceiptMarkers).toEqual(
      expect.arrayContaining([
        expect.stringContaining("runtime-receipt-result:"),
        expect.stringContaining("runtime-receipt-stdout:"),
      ]),
    );
    expect(result.repairEligible).toBe(false);
    expect(result.evidence).toContain("verification-command-result:mutation:not-run");
  });

  it("budgets and redacts failed command output", () => {
    const plan = buildVerificationCommandPlan({ explicitCommand: "npm test -- --help" });
    const result = buildVerificationCommandResult({
      plan,
      result: toolResult({
        success: false,
        stderr: "token=secret123 " + "x".repeat(600),
      }),
    });
    const evidence = result.evidence.join("\n");

    expect(result.outcome).toBe("failed");
    expect(result.failureClassification?.failureClass).toBe("test-failed");
    expect(result.stderrBudgetStatus).toBe("redacted");
    expect(evidence).not.toContain("secret123");
    expect(evidence.length).toBeLessThan(5000);
  });

  it("distinguishes skipped command verification before dispatch", () => {
    const result = buildVerificationCommandResult({
      plan: buildVerificationCommandPlan({ requireContext: false }),
    });

    expect(result.outcome).toBe("skipped");
    expect(result.verification.status).toBe("skipped");
    expect(result.runtimeReceiptMarkers).toEqual([]);
    expect(result.evidence).toContain(
      "verification-command-result:provider-call:not-run",
    );
  });

  it("distinguishes timeout command verification", () => {
    const plan = buildVerificationCommandPlan({ explicitCommand: "node --version" });
    const result = buildVerificationCommandResult({
      plan,
      result: {
        ...toolResult({ success: false, stderr: "command timed out" }),
        metadata: {
          ...toolResult({ success: false, stderr: "command timed out" }).metadata,
          failureKind: "timeout",
        },
      },
    });

    expect(result.outcome).toBe("timeout");
    expect(result.timeoutStatus).toBe("timed-out");
    expect(result.repairEligible).toBe(false);
  });

  it("creates Result Surface and Continue evidence without raw output", () => {
    const plan = buildVerificationCommandPlan({ explicitCommand: "npm test -- --help" });
    const commandResult = buildVerificationCommandResult({
      plan,
      result: toolResult({ success: false, stderr: "assertion failed" }),
    });
    const surface = buildVerificationCommandSurfaceResult({
      sessionId: "sess-command-result",
      prompt: "run verification command",
      result: commandResult,
    });

    expect(surface.status).toBe("stopped_error");
    expect(surface.finalOutput).toContain("verification command failed");
    expect(surface.codingResult?.continuation.evidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining("verification-command id="),
      ]),
    );
  });
});

function toolResult(input: {
  readonly success: boolean;
  readonly stdout?: string;
  readonly stderr?: string;
}): ToolLifecycleResult {
  const receipt = projectRuntimeReceipt(
    createCommandRuntimeReceipt({
      command: "npm test -- --help",
      status: input.success ? "completed" : "failed",
      executionPath: "fake-runtime",
      exitCode: input.success ? 0 : 1,
      stdout: input.stdout,
      stderr: input.stderr,
    }),
  );
  return {
    success: input.success,
    output: input.stdout,
    error: input.stderr,
    metadata: { runtimeReceipt: receipt, exitCode: input.success ? 0 : 1 },
    projection: input.success
      ? { kind: "success", legacySuccess: true, toolName: "bash" }
      : {
          kind: "tool-execution-failed",
          legacySuccess: false,
          reason: input.stderr,
          failureBoundary: "tool-execution-failed",
          toolName: "bash",
        },
  };
}
