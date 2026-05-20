import { describe, expect, it } from "vitest";
import { createCommandRuntimeReceipt } from "../core/runtime/runtimeReceipt.js";
import { projectRuntimeReceipt } from "../core/runtime/runtimeReceiptProjection.js";
import type { ToolLifecycleResult } from "./flowDispatch.js";
import {
  planVerification,
  planVerificationRetry,
  stripVerificationTailForMutationTarget,
} from "./verificationPlanner.js";
import {
  projectCommandVerificationResult,
  projectNotRequestedVerification,
  projectSkippedVerification,
} from "./verificationResultProjection.js";

describe("verification planner", () => {
  it("selects explicit allowlisted verify commands", () => {
    const plan = planVerification({
      taskKind: "edit-file",
      prompt: "Edit src/app.ts, then run node --version to verify",
      changedFiles: ["src/app.ts"],
      explicitVerifyRequested: true,
      explicitVerifyCommand: "node --version",
    });

    expect(plan.mode).toBe("command");
    expect(plan.command).toBe("node --version");
    expect(plan.selectionScope).toBe("focused");
    expect(plan.selectionSource).toBe("explicit-user");
  });

  it("auto-selects focused verification for test-only mutations", () => {
    const plan = planVerification({
      taskKind: "edit-file",
      prompt: "Edit tests/sample.test.ts and replace v1 with v2",
      changedFiles: ["tests/sample.test.ts"],
      explicitVerifyRequested: false,
    });

    expect(plan.mode).toBe("command");
    expect(plan.command).toBe("node --version");
    expect(plan.selectionScope).toBe("focused");
    expect(plan.selectionSource).toBe("auto-from-changes");
  });

  it("does not request auto verification for no-write read and inspect tasks", () => {
    for (const taskKind of ["read-file", "inspect-files"] as const) {
      const plan = planVerification({
        taskKind,
        prompt: "Read src/app.ts",
        changedFiles: [],
        explicitVerifyRequested: false,
      });

      expect(plan.mode).toBe("not-requested");
      expect(projectNotRequestedVerification(plan).status).toBe(
        "not-requested",
      );
    }
  });

  it("maps command success to passed without mutation failure leakage", () => {
    const plan = planVerification({
      taskKind: "edit-file",
      prompt: "Edit src/app.ts and verify",
      changedFiles: ["src/app.ts"],
      explicitVerifyRequested: false,
    });
    const retry = planVerificationRetry({
      plan,
      attempt: 1,
      outcome: "passed",
    });
    const projected = projectCommandVerificationResult({
      plan,
      result: toolResult({ success: true }),
      attempt: 1,
      retry,
      workspaceRoot: "/tmp/work",
      verifyLikeCommand: true,
    });

    expect(projected.verification.status).toBe("passed");
    expect(projected.note).toContain("verify passed");
    expect(projected.evidence).toContain("verify-retry:retry-not-planned:passed");
  });

  it("maps command failure to failed with retry exhaustion reason", () => {
    const plan = planVerification({
      taskKind: "edit-file",
      prompt: "Edit src/app.ts, then run npm run build -- --help to verify",
      changedFiles: ["src/app.ts"],
      explicitVerifyRequested: true,
      explicitVerifyCommand: "npm run build -- --help",
    });
    const retry = planVerificationRetry({
      plan,
      attempt: 2,
      outcome: "failed",
    });
    const projected = projectCommandVerificationResult({
      plan,
      result: toolResult({
        success: false,
        error: "missing script: build",
        projectionKind: "tool-execution-failed",
      }),
      attempt: 2,
      retry,
      workspaceRoot: "/tmp/work",
      verifyLikeCommand: true,
    });

    expect(projected.verification.status).toBe("failed");
    expect(projected.verification.reason).toContain(
      "Verification command failed after 2 attempts",
    );
    expect(projected.verification.nextAction).toContain("rerun verification");
  });

  it("maps unsupported explicit verify command to unavailable planning", () => {
    const plan = planVerification({
      taskKind: "edit-file",
      prompt: "Edit src/app.ts and verify",
      changedFiles: ["src/app.ts"],
      explicitVerifyRequested: true,
      explicitVerifyCommand: "npm run lint",
    });
    const projected = projectSkippedVerification(plan);

    expect(plan.mode).toBe("unavailable");
    expect(projected.status).toBe("skipped");
    expect(projected.reason).toContain("not allowed in the MVP allowlist");
  });

  it("distinguishes skipped auto verification from not-requested verification", () => {
    const skipped = planVerification({
      taskKind: "edit-file",
      prompt: "Edit README.md and replace v1 with v2",
      changedFiles: ["README.md"],
      explicitVerifyRequested: false,
    });
    const notRequested = planVerification({
      taskKind: "read-file",
      prompt: "Read README.md",
      changedFiles: [],
      explicitVerifyRequested: false,
    });

    expect(projectSkippedVerification(skipped).status).toBe("skipped");
    expect(projectNotRequestedVerification(notRequested).status).toBe(
      "not-requested",
    );
  });

  it("plans retry only for failed command verification before exhaustion", () => {
    const plan = planVerification({
      taskKind: "edit-file",
      prompt: "Edit src/app.ts, then run npm test -- --help to verify",
      changedFiles: ["src/app.ts"],
      explicitVerifyRequested: true,
      explicitVerifyCommand: "npm test -- --help",
    });

    expect(
      planVerificationRetry({ plan, attempt: 1, outcome: "failed" }).status,
    ).toBe("retry-planned");
    expect(
      planVerificationRetry({ plan, attempt: 2, outcome: "failed" }).status,
    ).toBe("retry-not-planned");
    expect(
      planVerificationRetry({ plan, attempt: 1, outcome: "blocked" })
        .reasonCode,
    ).toBe("blocked");
  });

  it("projects transcript-safe verification evidence without raw output", () => {
    const plan = planVerification({
      taskKind: "edit-file",
      prompt: "Edit src/app.ts and verify",
      changedFiles: ["src/app.ts"],
      explicitVerifyRequested: false,
    });
    const retry = planVerificationRetry({
      plan,
      attempt: 1,
      outcome: "failed",
    });
    const projected = projectCommandVerificationResult({
      plan,
      result: toolResult({
        success: false,
        error: "x".repeat(400),
        projectionKind: "tool-execution-failed",
      }),
      attempt: 1,
      retry,
      targetPath: "src/app.ts",
      workspaceRoot: "/tmp/work",
      verifyLikeCommand: true,
    });

    expect(projected.evidence).toContain("verify-command-hint:node --version");
    expect(projected.evidence.join("\n")).not.toContain("x".repeat(300));
  });

  it("includes budgeted runtime receipt evidence for verify command results", () => {
    const plan = planVerification({
      taskKind: "edit-file",
      prompt: "Edit src/app.ts and verify",
      changedFiles: ["src/app.ts"],
      explicitVerifyRequested: false,
    });
    const retry = planVerificationRetry({
      plan,
      attempt: 1,
      outcome: "failed",
    });
    const runtimeReceipt = projectRuntimeReceipt(
      createCommandRuntimeReceipt({
        command: "node --version",
        status: "failed",
        executionPath: "ts-local",
        exitCode: 1,
        stdout: "token=secret123 " + "x".repeat(400),
        stderr: "command failed",
      }),
    );
    const projected = projectCommandVerificationResult({
      plan,
      result: toolResult({
        success: false,
        error: "command failed",
        projectionKind: "tool-execution-failed",
        metadata: { runtimeReceipt },
      }),
      attempt: 1,
      retry,
      targetPath: "src/app.ts",
      workspaceRoot: "/tmp/work",
      verifyLikeCommand: true,
    });
    const evidence = projected.evidence.join("\n");

    expect(evidence).toContain("runtime-receipt-result:");
    expect(evidence).toContain("runtime-receipt-transcript:");
    expect(evidence).toContain("runtime-receipt-stdout:");
    expect(evidence).toContain("runtime-receipt-stderr:");
    expect(evidence).not.toContain("secret123");
    expect(projected.evidence.every((entry) => entry.length <= 280)).toBe(true);
  });

  it("strips verification tails before mutation target disambiguation", () => {
    expect(
      stripVerificationTailForMutationTarget(
        "Update plan.txt with exactly: done. Verify todo.txt and plan.txt stay consistent.",
      ),
    ).toBe("Update plan.txt with exactly: done");
  });
});

function toolResult(input: {
  readonly success: boolean;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
  readonly projectionKind?: ToolLifecycleResult["projection"]["kind"];
}): ToolLifecycleResult {
  return {
    success: input.success,
    error: input.error,
    metadata: input.metadata,
    projection: {
      kind: input.projectionKind ?? (input.success ? "success" : "tool-execution-failed"),
      legacySuccess: input.success,
      ...(input.error ? { reason: input.error } : {}),
    },
  };
}
