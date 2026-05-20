import { describe, expect, it } from "vitest";
import type { PwRuntimeStatus } from "../core/context/pwRuntime.js";
import type { QueryEvent } from "../core/query/events.js";
import {
  detectWorkflowBrowserPlan,
  executeBrowserModulePlan,
} from "./browserModule.js";
import { projectProviderDiagnosticHandoff } from "./providerModule.js";
import {
  projectWorkflowBlockedOutcome,
  projectWorkflowRuntimeOutcome,
} from "./resultSurfaceModule.js";
import {
  createToolRuntimeProvenanceCollector,
  dispatchRuntimeTool,
  summarizeToolRuntimeProvenance,
} from "./toolRuntimeModule.js";

const readyBrowserRuntime: PwRuntimeStatus = {
  status: "ready",
  reasonCode: "ready",
  dependency: "none",
  browserName: "chromium",
  executableSource: "none",
  realBrowserValidationAvailable: false,
  passiveStatusCheck: true,
  browserLaunched: false,
  providerCall: "none",
  modelCall: "none",
  mcpLaunched: false,
  reason: "test runtime",
  nextAction: "none",
  warnings: [],
  evidence: [],
};

describe("agent loop execution/result facades", () => {
  it("keeps browser continuation result handoff inside the browser facade", async () => {
    const plan = detectWorkflowBrowserPlan({
      prompt: "continue previous browser evidence",
      continuityState: {
        lastContinuationEvidence: [
          "browser-agent-observation:visible-text",
          "browser-agent-transaction:completed",
        ],
      },
    });

    expect(plan?.continuationSummary).toContain("browser-agent-observation");
    const result = await executeBrowserModulePlan({
      plan: plan!,
      freshnessObservability: {
        notes: ["freshness:checked"],
        evidence: ["freshness:ok"],
      },
      dispatcher: {
        async dispatch() {
          throw new Error("continuation summary should not dispatch tools");
        },
      },
      browserRuntimeStatus: readyBrowserRuntime,
      sessionId: "sess_browser",
      turn: 1,
      workspaceRoot: process.cwd(),
    });

    expect(result.notes).toContain("browser-agent: tool pipeline selected");
    expect(result.codingResult.taskKind).toBe("browser");
    expect(result.userFacingOutput).toContain("Raw DOM: excluded");
  });

  it("keeps tool dispatch and provenance handoff inside the tool runtime facade", async () => {
    const events: QueryEvent[] = [];
    const provenance = createToolRuntimeProvenanceCollector();
    const result = await dispatchRuntimeTool({
      dispatcher: {
        async dispatch() {
          return { success: true, output: "v1.0.0" };
        },
      },
      events,
      toolName: "bash",
      taskId: "task_tool_runtime",
      args: { command: "node --version" },
      workspaceRoot: process.cwd(),
      sessionId: "sess_tool_runtime",
      requireApprovalEvent: false,
      provenanceCollector: provenance,
    });

    expect(result.success).toBe(true);
    expect(events.map((event) => event.type)).toEqual([
      "tool.started",
      "tool.result",
    ]);
    expect(summarizeToolRuntimeProvenance(provenance)).toMatchObject({
      toolExecutions: [
        {
          kind: "executed-succeeded",
          toolName: "bash",
        },
      ],
    });
  });

  it("keeps provider diagnostic handoff behind the provider facade", () => {
    const projection = projectProviderDiagnosticHandoff({
      lastFailureHandoffDiagnostic:
        "provider: status=failed; target=src/app.ts; command=npm test; blocker=provider-network",
    });

    expect(projection.diagnosticHandoff).toMatchObject({
      kind: "failure",
      status: "failed",
      target: "src/app.ts",
      command: "npm test",
      blockerKind: "provider-network",
    });
    expect(projection.lineage).toContain("diagnosticCommandInherited=yes");
  });

  it("keeps runtime/result stopped and coding outcomes behind the result facade", () => {
    const blocked = projectWorkflowBlockedOutcome({
      taskKind: "edit-file",
      blockedReason: "patch-from-not-found: source text missing",
      targetPath: "src/app.ts",
      freshnessEvidence: ["freshness:ok"],
    });
    expect(blocked.userFacingOutput).toContain("Outcome: blocked");
    expect(blocked.codingResult.verification.status).toBe("skipped");

    const completed = projectWorkflowRuntimeOutcome({
      taskKind: "inspect-files",
      changedFiles: [],
      failedFiles: [],
      patches: [],
      verifiedFiles: [],
      unverifiedFiles: [],
      verification: {
        status: "not-requested",
        selectionScope: "none",
        selectionSource: "not-requested",
      },
      repairNotes: [],
      evidence: ["inspect:ok"],
      taskVerdict: "satisfied",
      taskReasons: ["Repository inspection executed."],
      userFacingOutput: "Repository inspection result",
    });

    expect(completed.codingResult.taskKind).toBe("inspect-files");
    expect(completed.userFacingOutput).toBe("Repository inspection result");
  });
});
