import { describe, expect, it } from "vitest";

import type { WorkflowTaskPlan } from "../../orchestration/workflowTaskPlanner.js";
import {
  buildWorkflowActionGraph,
  orderedMutationTargetsFromGraph,
  projectWorkflowActionCursor,
  updateWorkflowActionGraphFromFeedback,
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

  it("updates action graph after context re-narrowing and verification feedback", () => {
    const graph = buildWorkflowActionGraph({
      taskKind: "edit-file",
      reason: "fix status policy",
      targetPath: "src/statusPolicy.ts",
      inspectFirst: true,
      verifyAfterEdit: true,
    } as WorkflowTaskPlan);

    const renarrowed = updateWorkflowActionGraphFromFeedback({
      graph: graph!,
      feedback: {
        source: "context-renarrowing",
        refinedTargetPath: "src/payments/statusPolicy.ts",
        additionalTargetPaths: ["src/payments/statusConsumer.ts"],
      },
    });
    expect(renarrowed.changedFileIntents).toEqual([
      "src/payments/statusPolicy.ts",
      "src/statusPolicy.ts",
      "src/payments/statusConsumer.ts",
    ]);
    expect(orderedMutationTargetsFromGraph(renarrowed)).toEqual([
      "src/payments/statusPolicy.ts",
      "src/payments/statusConsumer.ts",
    ]);

    const repaired = updateWorkflowActionGraphFromFeedback({
      graph: renarrowed,
      feedback: {
        source: "verification",
        failedChangedFiles: ["src/payments/statusConsumer.ts"],
        verificationFailureSummary: "consumer still imports stale status name",
      },
    });

    expect(repaired.orderedNodeIds).toEqual(
      expect.arrayContaining([
        "diagnose-failure",
        "repair-from-diagnosis",
        "reverify-repair",
      ]),
    );
    expect(repaired.changedFileIntents).toContain("src/payments/statusConsumer.ts");
    expect(repaired.dependencyReasons).toEqual(
      expect.arrayContaining([
        "feedback:context-renarrowing:context-update",
        "feedback:verification:verification-failure",
      ]),
    );
    expect(projectWorkflowActionCursor({
      graph: repaired,
      completedNodeIds: [
        "inspect-target",
        "edit-primary",
        "write-related-src_payments_statusConsumer.ts",
        "verify-changes",
      ],
    }).nextAction).toEqual(
      expect.objectContaining({ id: "diagnose-failure", kind: "diagnose" }),
    );
  });

  it("keeps contract, implementation, consumer, and verification nodes distinct", () => {
    const graph = buildWorkflowActionGraph({
      taskKind: "edit-file",
      reason: "change status contract with implementation and consumer updates",
      targetPath: "src/status/contract.ts",
      additionalTargetPaths: [
        "src/status/adapter.ts",
        "src/orders/statusConsumer.ts",
      ],
      inspectFirst: true,
      verifyAfterEdit: true,
      verifyCommand: "npm test -- src/status/contract.test.ts",
    } as WorkflowTaskPlan);

    expect(graph?.changedFileIntents).toEqual([
      "src/status/contract.ts",
      "src/status/adapter.ts",
      "src/orders/statusConsumer.ts",
    ]);
    expect(graph?.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "verify-changes",
        kind: "verify",
        target: "src/status/contract.test.ts",
      }),
    ]));
    expect(graph?.dependencyReasons).toEqual(expect.arrayContaining([
      "verify-changes<-edit-primary+write-related-src_status_adapter.ts+write-related-src_orders_statusConsumer.ts: Verify the changed files and impacted tests after all planned mutations.",
    ]));
  });

  it("recognizes spec files as impacted verification targets", () => {
    const graph = buildWorkflowActionGraph({
      taskKind: "edit-file",
      reason: "change status mapper and run spec",
      targetPath: "src/status.ts",
      inspectFirst: true,
      verifyAfterEdit: true,
      verifyCommand: "vitest run src/status.spec.ts",
    } as WorkflowTaskPlan);

    expect(graph?.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "verify-changes",
        kind: "verify",
        target: "src/status.spec.ts",
      }),
    ]));
  });
});
