import { describe, expect, it } from "vitest";

import { buildAgentPlan } from "./agentPlan.js";
import { buildAnalysisBrief } from "./analysisBrief.js";
import { buildTaskExecutionPlan } from "./taskExecutionPlan.js";
import { buildTaskIntent } from "./taskIntent.js";
import { buildTaskLifecycle } from "./taskLifecycle.js";
import { buildTaskLifecycleResult } from "./taskLifecycleResult.js";
import { buildTaskLifecycleTrace } from "./taskLifecycleTrace.js";
import { buildTaskReadPlan } from "./taskReadPlan.js";
import { buildTaskStage } from "./taskStage.js";
import type { WorkflowTaskPlan } from "../../orchestration/workflowTaskPlanner.js";

describe("task lifecycle loop", () => {
  it("models read analyze plan evidence without granting mutation authority", () => {
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "edit-file",
      reason: "Add a bounded fix for src/app.ts",
      targetPath: "src/app.ts",
      contextPlanningRequested: true,
      contextPlanningReason: "missing-edit-context",
      inspectFirst: true,
      verifyAfterEdit: true,
      verifyCommand: "npm test -- --help",
    };
    const agentPlan = buildAgentPlan({
      ownerCapability: "workspace-file-context",
      taskKind: "edit-file",
      requestedActionKind: "context-planning",
      targetSummary: "src/app.ts",
      contextPacketIds: ["packet_1"],
      contextCompleteness: "complete",
      confidence: "medium",
      executionReadiness: "ready",
      missingFacts: [],
      suggestedReads: ["src/app.test.ts"],
      suggestedVerification: ["npm test -- --help"],
      safeEvidenceMarkers: ["agent-plan:readiness:ready"],
      mutationAuthority: "not-granted",
      redactionStatus: "redacted-and-budgeted",
      doNext: "Proceed through existing gates.",
    });
    const intent = buildTaskIntent({
      userRequest: "Please fix src/app.ts",
      workflowPlan,
      requestedActionKind: agentPlan.requestedActionKind,
    });
    const readPlan = buildTaskReadPlan({ intent });
    const brief = buildAnalysisBrief({ intent, readPlan, agentPlan });
    const lifecycle = buildTaskLifecycle({
      intent,
      stages: [
        buildTaskStage({
          kind: "read",
          readiness: "complete",
          outputEvidenceIds: [readPlan.readPlanId],
        }),
        buildTaskStage({
          kind: "analyze",
          readiness: "complete",
          inputEvidenceIds: [readPlan.readPlanId],
          outputEvidenceIds: [brief.briefId],
        }),
        buildTaskStage({
          kind: "plan",
          readiness: "ready",
          inputEvidenceIds: [brief.briefId],
          outputEvidenceIds: [agentPlan.planId],
        }),
      ],
    });
    const executionPlan = buildTaskExecutionPlan({
      brief,
      readPlan,
      lifecycle,
      agentPlan,
    });
    const result = buildTaskLifecycleResult({
      lifecycle,
      readPlan,
      analysisBrief: brief,
      executionPlan,
    });
    const trace = buildTaskLifecycleTrace({
      lifecycle,
      readPlan,
      analysisBrief: brief,
      executionPlan,
      planQualityId: "plan_quality_1",
      codeGraphTraceId: "code_graph_trace_1",
    });

    expect(intent.mutationAuthority).toBe("not-granted");
    expect(readPlan.noWriteEvidence).toContain("task-read-plan:no-provider-call");
    expect(brief.evidence).toContain("analysis-brief:hidden-cot-excluded");
    expect(lifecycle.currentStage).toBe("plan");
    expect(executionPlan.requiredConfirmation).toContain(
      "proposal review before edit handoff",
    );
    expect(result.output).toContain("No-write status: mutation authority not granted");
    expect(trace.evidence).toContain(`task-lifecycle-trace:lifecycle:${lifecycle.lifecycleId}`);
  });

  it("stops provider/edit readiness when analysis evidence is missing", () => {
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "edit-file",
      reason: "Edit without target",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason: "target missing",
      targetMissing: true,
    };
    const intent = buildTaskIntent({ userRequest: "edit it", workflowPlan });
    const readPlan = buildTaskReadPlan({ intent });
    const brief = buildAnalysisBrief({ intent, readPlan });
    const lifecycle = buildTaskLifecycle({
      intent,
      stages: [
        buildTaskStage({
          kind: "read",
          readiness: "needs-evidence",
          missingFacts: brief.missingFacts,
          stopReason: "target missing",
        }),
      ],
    });
    const executionPlan = buildTaskExecutionPlan({ brief, readPlan, lifecycle });

    expect(lifecycle.overallStatus).toBe("stopped");
    expect(executionPlan.proposalReadiness).toBe("needs-evidence");
    expect(executionPlan.evidence).toContain("task-execution-plan:provider-call:not-run");
  });
});
