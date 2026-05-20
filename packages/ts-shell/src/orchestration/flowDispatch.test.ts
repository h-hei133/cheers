import { describe, expect, it } from "vitest";
import type { QueryEvent } from "../core/query/events.js";
import { createCommandRuntimeReceipt } from "../core/runtime/runtimeReceipt.js";
import { projectRuntimeReceipt } from "../core/runtime/runtimeReceiptProjection.js";
import {
  createDispatchProvenanceCollector,
  dispatchToolWithLifecycle,
  projectDispatchReentrySummary,
  projectRuntimeReceiptEvidence,
  projectRunCommandDispatchOutcome,
  type ToolDispatchRuntime,
} from "./flowDispatch.js";

describe("agent-loop flow dispatch", () => {
  it("emits approval and tool lifecycle events for an approved dispatch", async () => {
    const events: QueryEvent[] = [];
    const dispatcher: ToolDispatchRuntime = {
      async dispatch() {
        return { success: true, output: "v1.0.0" };
      },
    };
    const provenanceCollector = createDispatchProvenanceCollector();

    const result = await dispatchToolWithLifecycle({
      dispatcher,
      events,
      toolName: "bash",
      taskId: "task_approved",
      args: { command: "node --version" },
      workspaceRoot: "/workspace",
      sessionId: "sess_approved",
      requireApprovalEvent: true,
      provenanceCollector,
    });

    expect(events.map((event) => event.type)).toEqual([
      "approval.requested",
      "tool.started",
      "approval.resolved",
      "tool.result",
    ]);
    expect(events[2]).toMatchObject({ type: "approval.resolved", outcome: "approved" });
    expect(result.success).toBe(true);
    expect(result.projection.kind).toBe("success");
    expect(result.provenance?.toolExecutions?.[0]).toMatchObject({
      kind: "executed-succeeded",
      toolName: "bash",
    });
  });

  it("keeps approval-denied dispatches stopped and resume eligible", async () => {
    const events: QueryEvent[] = [];
    const dispatcher: ToolDispatchRuntime = {
      async dispatch() {
        return {
          success: false,
          error: "approval denied",
          metadata: { wasEscalated: true },
        };
      },
    };

    const result = await dispatchToolWithLifecycle({
      dispatcher,
      events,
      toolName: "bash",
      taskId: "task_denied",
      args: { command: "npm test" },
      workspaceRoot: "/workspace",
      sessionId: "sess_denied",
      requireApprovalEvent: true,
    });
    const summary = projectDispatchReentrySummary({
      toolName: "bash",
      taskId: "task_denied",
      approvalState: "denied",
      result,
    });

    expect(events[2]).toMatchObject({ type: "approval.resolved", outcome: "denied" });
    expect(result.projection.kind).toBe("approval-denied");
    expect(summary).toMatchObject({
      state: "approval-denied",
      reasonCode: "approval-denied",
      resumeEligible: true,
    });
  });

  it("projects approval pending before a result exists", () => {
    expect(
      projectDispatchReentrySummary({
        toolName: "bash",
        taskId: "task_pending",
        approvalState: "requested",
      }),
    ).toEqual({
      state: "approval-pending",
      reasonCode: "approval-requested",
      doNext: "wait-for-approval-decision",
      resumeEligible: true,
      safeSummary: "bash:task_pending:approval-pending",
    });
  });

  it("projects streamed-result reentry without raw content", () => {
    const summary = projectDispatchReentrySummary({
      toolName: "browser.observe",
      taskId: "task_streamed",
      approvalState: "not-required",
      terminalReason: "completed",
      finalOutput:
        "<html><body>secret: abc token=hidden cookie=value</body></html>",
    });

    expect(summary.state).toBe("streamed-result");
    expect(summary.safeSummary).toContain("[raw-content-excluded]");
    expect(summary.safeSummary).not.toMatch(/abc|hidden|cookie=value|<html/i);
  });

  it("projects stopped dispatch summaries without leaking raw detail", () => {
    const summary = projectDispatchReentrySummary({
      toolName: "browser.extract",
      taskId: "task_stopped",
      approvalState: "approved",
      result: {
        success: false,
        error: "failed",
        projection: {
          kind: "tool-execution-failed",
          legacySuccess: false,
          reason: "authorization: Bearer abc123 <html>raw page</html>",
        },
      },
    });

    expect(summary).toMatchObject({
      state: "stopped",
      reasonCode: "tool-execution-failed",
      resumeEligible: true,
    });
    expect(summary.safeSummary).not.toMatch(/Bearer abc123|<html>|raw page/i);
  });

  it("projects runtime receipt evidence with budgeted stdout and stderr", () => {
    const receipt = projectRuntimeReceipt(
      createCommandRuntimeReceipt({
        command: "npm test -- --help",
        status: "failed",
        executionPath: "ts-local",
        exitCode: 2,
        stdout: "api_key=secret123 " + "x".repeat(400),
        stderr:
          "Bearer abcdefghijklmnop /home/wang/.private-agents-real/provider.env",
      }),
    );

    const evidence = projectRuntimeReceiptEvidence({
      metadata: { runtimeReceipt: receipt },
    }).join("\n");

    expect(evidence).toContain("runtime-receipt-result:");
    expect(evidence).toContain("runtime-receipt-transcript:");
    expect(evidence).toContain("runtime-receipt-stdout:");
    expect(evidence).toContain("runtime-receipt-stderr:");
    expect(evidence).toContain("runtime-receipt-redaction:redacted");
    expect(evidence).not.toContain("secret123");
    expect(evidence).not.toContain("abcdef");
    expect(evidence).not.toContain("/home/wang/.private-agents-real");
    for (const line of evidence.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(280);
    }
  });

  it("keeps successful run-command dispatch complete without file mutation", () => {
    const projected = projectRunCommandDispatchOutcome({
      command: "node --version",
      changedFiles: [],
      failedFiles: [],
      patches: [],
      verifiedFiles: [],
      unverifiedFiles: [],
      verification: {
        status: "passed",
        command: "node --version",
        reason: "run-command executed",
      },
      repairNotes: [],
      evidence: ["current-permission-request-tool:bash"],
    });

    expect(projected.userFacingOutput).toBe("Command completed: node --version");
    expect(projected.codingResult.taskSatisfaction).toMatchObject({
      verdict: "satisfied",
      reasons: ["Command executed successfully: node --version"],
    });
    expect(projected.codingResult.changedFiles).toEqual([]);
  });
});
