import { describe, expect, it } from "vitest";
import { projectRuntimeReceipt } from "../../../core/runtime/runtimeReceiptProjection.js";
import { createCommandRuntimeReceipt } from "../../../core/runtime/runtimeReceipt.js";
import type { ToolLifecycleResult } from "../../../orchestration/flowDispatch.js";
import { projectRuntimeReceiptEvidence } from "../../../orchestration/flowDispatch.js";
import { classifyVerificationCommandFailure } from "./classifier.js";
import { buildVerificationCommandPlan } from "../../command/plan.js";

describe("verificationFailureClassifier", () => {
  it("classifies failed allowlisted test commands as repair eligible", () => {
    const plan = buildVerificationCommandPlan({ explicitCommand: "npm test -- --help" });
    const result = toolResult("tests failed", "failed");
    const classified = classifyVerificationCommandFailure({
      plan,
      result,
      runtimeReceiptMarkers: projectRuntimeReceiptEvidence(result),
    });

    expect(classified.failureClass).toBe("test-failed");
    expect(classified.repairEligible).toBe(true);
    expect(classified.evidence).toContain(
      "verification-command-classifier:class:test-failed",
    );
  });

  it("keeps not-allowlisted commands ineligible and not-run", () => {
    const plan = buildVerificationCommandPlan({ explicitCommand: "npm run deploy" });
    const classified = classifyVerificationCommandFailure({ plan });

    expect(classified.failureClass).toBe("command-not-allowlisted");
    expect(classified.repairEligible).toBe(false);
    expect(classified.nextAction).toContain("Allowed commands");
  });

  it("classifies timeout receipts separately from repairable failures", () => {
    const plan = buildVerificationCommandPlan({ explicitCommand: "node --version" });
    const result = toolResult("timed out", "timeout");
    const classified = classifyVerificationCommandFailure({
      plan,
      result,
      runtimeReceiptMarkers: projectRuntimeReceiptEvidence(result),
    });

    expect(classified.failureClass).toBe("command-timed-out");
    expect(classified.repairEligible).toBe(false);
  });
});

function toolResult(reason: string, status: "failed" | "timeout"): ToolLifecycleResult {
  const receipt = projectRuntimeReceipt(
    createCommandRuntimeReceipt({
      command: "npm test -- --help",
      status,
      executionPath: "fake-runtime",
      exitCode: status === "failed" ? 1 : undefined,
      timeoutMs: status === "timeout" ? 100 : undefined,
      stderr: reason,
    }),
  );
  return {
    success: false,
    error: reason,
    metadata: {
      runtimeReceipt: receipt,
      failureKind: status === "timeout" ? "timeout" : "exit-code",
    },
    projection: {
      kind: "tool-execution-failed",
      legacySuccess: false,
      reason,
      failureBoundary: "tool-execution-failed",
      toolName: "bash",
    },
  };
}
