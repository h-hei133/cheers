import { describe, expect, it } from "vitest";
import { createCommandRuntimeReceipt } from "../core/runtime/runtimeReceipt.js";
import { projectRuntimeReceipt } from "../core/runtime/runtimeReceiptProjection.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import type { ToolExecutionContext, ToolExecutionResult } from "../tools/types.js";
import {
  buildTaskRelevantCommandPlan,
  runTaskRelevantVerificationRoute,
} from "./taskRelevantVerificationRoute.js";

describe("taskRelevantVerificationRoute", () => {
  it("selects a package-relevant verification command from changed files", () => {
    const plan = buildTaskRelevantCommandPlan({
      changedFiles: ["packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts"],
    });

    expect(plan.selectedCommand).toBe("npm run build -w packages/ts-shell");
    expect(plan.relevanceStatus).toBe("relevant");
    expect(plan.coveredFiles).toEqual([
      "packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts",
    ]);
    expect(plan.verificationCommandPlan.state).toBe("ready");
    expect(plan.verificationCommandPlan.commandKind).toBe("npm-build-ts-shell");
  });

  it("rejects command-only bypass success as task verification", async () => {
    const dispatches: string[] = [];
    const result = await runTaskRelevantVerificationRoute({
      workspaceRoot: "/tmp/route223",
      taskId: "frozen-command-only-bypass-negative-control",
      sessionId: "sess_route223_bypass",
      prompt: "Run a harmless unrelated command and claim verification.",
      changedFiles: ["packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts"],
      candidateCommands: ["node --version"],
      authority: {
        state: "explicitly-approved",
        source: "explicit-authority-contract",
        approvedCommand: "node --version",
      },
      dispatcher: fakeDispatcher(async (_toolName, args) => {
        dispatches.push(String(args.command));
        return commandResult(String(args.command), "completed", 0, "v20.0.0");
      }),
    });

    expect(dispatches).toEqual(["node --version"]);
    expect(result.dispatchStatus).toBe("dispatched");
    expect(result.run?.result.outcome).toBe("success");
    expect(result.commandPlan.relevanceStatus).toBe("unrelated");
    expect(result.verdict).toBe("insufficient-evidence");
    expect(result.resultSurface.status).toBe("stopped_error");
    expect(result.resultSurface.codingResult?.taskSatisfaction.verdict).toBe(
      "insufficient-evidence",
    );
    expect(result.notProvenClaims).toContain("task verification by unrelated command");
  });

  it("does not treat selected-but-not-run as success", async () => {
    const result = await runTaskRelevantVerificationRoute({
      workspaceRoot: "/tmp/route223",
      taskId: "selected-not-run-negative-control",
      sessionId: "sess_route223_not_run",
      prompt: "Select verification but do not grant authority.",
      changedFiles: ["packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts"],
      authority: {
        state: "not-granted",
        source: "none",
      },
      dispatcher: fakeDispatcher(async () => {
        throw new Error("should not dispatch without explicit authority");
      }),
    });

    expect(result.commandPlan.relevanceStatus).toBe("relevant");
    expect(result.dispatchStatus).toBe("not-run");
    expect(result.verdict).toBe("approval-required");
    expect(result.resultSurface.status).toBe("stopped_error");
    expect(result.notProvenClaims).toEqual(
      expect.arrayContaining(["selected command dispatch", "runtime receipt", "task success"]),
    );
  });

  it("blocks success and marks repair evidence when a relevant command fails", async () => {
    const result = await runTaskRelevantVerificationRoute({
      workspaceRoot: "/tmp/route223",
      taskId: "failed-relevant-command-negative-control",
      sessionId: "sess_route223_failed",
      prompt: "Run relevant verification and preserve failure.",
      changedFiles: ["packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts"],
      authority: {
        state: "explicitly-approved",
        source: "explicit-authority-contract",
        approvedCommand: "npm run build -w packages/ts-shell",
      },
      dispatcher: fakeDispatcher(async (_toolName, args) =>
        commandResult(String(args.command), "failed", 1, "", "TypeScript build failed"),
      ),
    });

    expect(result.dispatchStatus).toBe("dispatched");
    expect(result.commandPlan.relevanceStatus).toBe("relevant");
    expect(result.run?.result.outcome).toBe("failed");
    expect(result.verdict).toBe("verification-failed");
    expect(result.resultSurface.status).toBe("stopped_error");
    expect(result.resultSurface.codingResult?.repair.status).toBe("failed");
    expect(result.resultSurface.codingResult?.taskSatisfaction.verdict).toBe(
      "insufficient-evidence",
    );
  });

  it("uses relevant runtime receipt success as result-surface verification evidence", async () => {
    const result = await runTaskRelevantVerificationRoute({
      workspaceRoot: "/tmp/route223",
      taskId: "route223-positive-relevance",
      sessionId: "sess_route223_success",
      prompt: "Verify changed file with relevant command.",
      changedFiles: ["packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts"],
      authority: {
        state: "explicitly-approved",
        source: "explicit-authority-contract",
        approvedCommand: "npm run build -w packages/ts-shell",
      },
      dispatcher: fakeDispatcher(async (_toolName, args) =>
        commandResult(String(args.command), "completed", 0, "build ok"),
      ),
    });

    expect(result.verdict).toBe("verified");
    expect(result.resultSurface.status).toBe("completed");
    expect(result.resultSurface.codingResult?.verification.status).toBe("passed");
    expect(result.resultSurface.codingResult?.verifiedFiles).toEqual([
      "packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts",
    ]);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "task-relevant-verification:relevance:relevant",
        "task-relevant-verification:dispatch:dispatched",
        "task-relevant-verification:verdict:verified",
      ]),
    );
  });
});

function fakeDispatcher(
  dispatch: (
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ) => Promise<ToolExecutionResult>,
): ToolDispatcher {
  return { dispatch } as ToolDispatcher;
}

function commandResult(
  command: string,
  status: "completed" | "failed",
  exitCode: number,
  stdout = "",
  stderr = "",
): ToolExecutionResult {
  return {
    success: status === "completed",
    output: `${stdout}${stderr}`.trim(),
    error: status === "completed" ? undefined : stderr,
    metadata: {
      executionPath: "test-runtime",
      status,
      exitCode,
      runtimeReceipt: projectRuntimeReceipt(
        createCommandRuntimeReceipt({
          command,
          status,
          executionPath: "test-runtime",
          exitCode,
          stdout,
          stderr,
        }),
      ),
    },
  };
}
