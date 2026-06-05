import { describe, expect, it } from "vitest";

import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";
import { createToolRuntimeProvenanceCollector } from "../orchestration/toolRuntimeModule.js";
import { runWorkflowVerificationStage } from "./verificationStage.js";

describe("runWorkflowVerificationStage", () => {
  it("uses action graph changed-file intents for verification execution accounting", async () => {
    const result = await runWorkflowVerificationStage({
      taskKind: "edit-file",
      prompt: "Update related status files.",
      changedFiles: ["src/status/producer.ts"],
      actionGraph: {
        graphId: "workflow_action_graph_status_pair",
        orderedNodeIds: ["edit-primary", "write-related-status", "verify-changes"],
        changedFileIntents: [
          "src/status/producer.ts",
          "src/status/consumer.ts",
        ],
        dependentTargets: [],
        dependencyReasons: [
          "write-related-status<-edit-primary: Apply related file update after the primary target mutation.",
          "verify-changes<-edit-primary+write-related-status: Verify the changed files after all planned mutations.",
        ],
        nodes: [],
      },
      explicitVerifyRequested: false,
      initialVerification: {
        status: "not-requested",
        reason: "not requested",
        selectionScope: "none",
        selectionSource: "not-requested",
      },
      unchangedAssertions: [],
      appliedContentByPath: new Map(),
      protectedSnapshots: new Map(),
      patches: [],
      dispatcher: { dispatch: async () => ({ success: true, output: "" }) } as ToolDispatcher,
      events: [],
      sessionId: "sess",
      turn: 1,
      workspaceRoot: "/workspace",
      provenanceCollector: createToolRuntimeProvenanceCollector(),
    });

    expect(result.verifiedFiles).toEqual([
      "src/status/producer.ts",
      "src/status/consumer.ts",
    ]);
    expect(result.unverifiedFiles).toEqual([]);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "workflow-verification-action-graph:workflow_action_graph_status_pair",
        "workflow-verification-changed-file-intents:src/status/producer.ts,src/status/consumer.ts",
        "workflow-verification-dependency:verify-changes<-edit-primary+write-related-status: Verify the changed files after all planned mutations.",
      ]),
    );
  });

  it("uses dependent target impacted verification in execution accounting", async () => {
    const result = await runWorkflowVerificationStage({
      taskKind: "edit-file",
      prompt: "Update related status files.",
      changedFiles: ["src/status/contract.ts"],
      actionGraph: {
        graphId: "workflow_action_graph_dependent_status",
        orderedNodeIds: ["edit-primary", "write-related-renderer", "verify-changes"],
        changedFileIntents: ["src/status/contract.ts"],
        dependentTargets: [
          {
            path: "src/orders/statusRenderer.ts",
            ownerRole: "consumer",
            rank: 1,
            reason: "renders status contract",
            impactedVerificationTargets: ["src/orders/statusRenderer.test.ts"],
          },
        ],
        dependencyReasons: [],
        nodes: [],
      },
      explicitVerifyRequested: false,
      initialVerification: {
        status: "not-requested",
        reason: "not requested",
        selectionScope: "none",
        selectionSource: "not-requested",
      },
      unchangedAssertions: [],
      appliedContentByPath: new Map(),
      protectedSnapshots: new Map(),
      patches: [],
      dispatcher: { dispatch: async () => ({ success: true, output: "" }) } as ToolDispatcher,
      events: [],
      sessionId: "sess",
      turn: 1,
      workspaceRoot: "/workspace",
      provenanceCollector: createToolRuntimeProvenanceCollector(),
    });

    expect(result.verifiedFiles).toEqual([
      "src/status/contract.ts",
      "src/orders/statusRenderer.ts",
      "src/orders/statusRenderer.test.ts",
    ]);
    expect(result.evidence).toEqual(expect.arrayContaining([
      "workflow-verification-dependent-target:1:consumer:src/orders/statusRenderer.ts:src/orders/statusRenderer.test.ts",
    ]));
  });
});
