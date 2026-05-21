import { describe, expect, it } from "vitest";
import { createCommandRuntimeReceipt } from "../core/runtime/runtimeReceipt.js";
import { projectRuntimeReceipt } from "../core/runtime/runtimeReceiptProjection.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import type { ToolExecutionContext, ToolExecutionResult } from "../tools/types.js";
import { runVerificationCommand } from "./verificationCommandRunner.js";
import { buildVerificationCommandPlan } from "./verificationCommandPlan.js";

describe("verificationCommandRunner", () => {
  it("runs ready commands through the existing runtime dispatcher", async () => {
    const calls: string[] = [];
    const dispatcher = fakeDispatcher(async (_toolName, args) => {
      calls.push(String(args.command));
      return {
        success: true,
        output: "v20.0.0",
        metadata: {
          runtimeReceipt: projectRuntimeReceipt(
            createCommandRuntimeReceipt({
              command: String(args.command),
              status: "completed",
              executionPath: "fake-runtime",
              stdout: "v20.0.0",
            }),
          ),
        },
      };
    });
    const run = await runVerificationCommand({
      plan: buildVerificationCommandPlan({ explicitCommand: "node --version" }),
      dispatcher,
      events: [],
      taskId: "task_verify",
      workspaceRoot: "/tmp/work",
      sessionId: "sess_verify",
    });

    expect(calls).toEqual(["node --version"]);
    expect(run.result.outcome).toBe("success");
    expect(run.evidence).toContain(
      "verification-command-runner:runtime-dispatch:existing-tool-runtime",
    );
    expect(run.mutation).toBe("not-run");
  });

  it("does not dispatch not-allowlisted commands", async () => {
    const calls: string[] = [];
    const run = await runVerificationCommand({
      plan: buildVerificationCommandPlan({ explicitCommand: "npm run lint" }),
      dispatcher: fakeDispatcher(async (_toolName, args) => {
        calls.push(String(args.command));
        return { success: true };
      }),
      events: [],
      taskId: "task_verify_blocked",
      workspaceRoot: "/tmp/work",
      sessionId: "sess_verify",
    });

    expect(calls).toEqual([]);
    expect(run.result.outcome).toBe("blocked");
    expect(run.evidence).toContain(
      "verification-command-runner:runtime-dispatch:not-run",
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
