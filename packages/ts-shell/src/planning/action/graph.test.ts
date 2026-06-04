import { describe, expect, it } from "vitest";

import type { WorkflowTaskPlan } from "../../orchestration/workflowTaskPlanner.js";
import {
  buildWorkflowActionGraph,
  orderedMutationTargetsFromGraph,
  projectWorkflowActionCursor,
} from "./graph.js";

describe("workflowActionGraph", () => {
  it("orders context, primary edit, related writes, verification, diagnosis, repair, and reverify", () => {
    const graph = buildWorkflowActionGraph({
      taskKind: "edit-file",
      reason: "fix status producer and consumer",
      targetPath: "src/status/producer.ts",
      additionalTargetPaths: ["src/status/consumer.ts"],
      inspectFirst: true,
      verifyAfterEdit: true,
      continuationRepairReplan: true,
    } as WorkflowTaskPlan);

    expect(graph?.orderedNodeIds).toEqual([
      "inspect-target",
      "edit-primary",
      "write-related-src_status_consumer.ts",
      "verify-changes",
      "diagnose-failure",
      "repair-from-diagnosis",
      "reverify-repair",
    ]);
    expect(graph?.changedFileIntents).toEqual([
      "src/status/producer.ts",
      "src/status/consumer.ts",
    ]);
    expect(graph?.dependencyReasons).toEqual(
      expect.arrayContaining([
        "write-related-src_status_consumer.ts<-edit-primary: Apply related file update after the primary target mutation.",
        "reverify-repair<-repair-from-diagnosis: Rerun relevant verification after the repair action.",
      ]),
    );
  });

  it("projects the next executable action from completed dependency facts", () => {
    const graph = buildWorkflowActionGraph({
      taskKind: "edit-file",
      reason: "fix status producer and consumer",
      targetPath: "src/status/producer.ts",
      additionalTargetPaths: ["src/status/consumer.ts"],
      inspectFirst: true,
      verifyAfterEdit: true,
    } as WorkflowTaskPlan);

    expect(projectWorkflowActionCursor({ graph: graph! }).nextAction).toEqual(
      expect.objectContaining({ id: "inspect-target", kind: "context" }),
    );
    const afterPrimary = projectWorkflowActionCursor({
      graph: graph!,
      completedNodeIds: ["inspect-target", "edit-primary"],
    });
    expect(afterPrimary.nextAction).toEqual(
      expect.objectContaining({
        id: "write-related-src_status_consumer.ts",
        kind: "write",
        target: "src/status/consumer.ts",
      }),
    );
    expect(afterPrimary.blockedNodeIds).toContain("verify-changes");
    expect(afterPrimary.evidence).toContain(
      "workflow-action-next:write-related-src_status_consumer.ts:write",
    );
    expect(orderedMutationTargetsFromGraph(graph)).toEqual([
      "src/status/producer.ts",
      "src/status/consumer.ts",
    ]);
  });
});
