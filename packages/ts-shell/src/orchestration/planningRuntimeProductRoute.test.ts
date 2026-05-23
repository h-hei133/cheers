import { describe, expect, it } from "vitest";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";
import {
  selectPlanningRuntimeProductRoute,
  shouldRunPlanningRuntimeForBlockedVagueTask,
} from "./planningRuntimeProductRoute.js";

describe("planning runtime product route guard", () => {
  it("accepts blocked vague edit tasks before mutation", () => {
    const plan: WorkflowTaskPlan = {
      taskKind: "edit-file",
      reason: "write/edit intent without resolvable target",
      inspectFirst: true,
      verifyAfterEdit: false,
      targetMissing: true,
      blockedReason: "edit-target-missing",
    };

    expect(shouldRunPlanningRuntimeForBlockedVagueTask(plan)).toBe(true);
    expect(selectPlanningRuntimeProductRoute(plan)).toMatchObject({
      shouldRun: true,
      routeKind: "blocked-vague-edit",
      taskKind: "edit-file",
    });
  });

  it("accepts vague write, read, inspect, and repo analysis product routes", () => {
    const writeDecision = selectPlanningRuntimeProductRoute({
      taskKind: "write-file",
      reason: "write intent without resolvable target",
      inspectFirst: false,
      verifyAfterEdit: false,
      targetMissing: true,
      blockedReason: "Target file is required for write task.",
    });
    expect(writeDecision).toMatchObject({
      shouldRun: true,
      routeKind: "blocked-vague-write",
      taskKind: "write-file",
    });

    const readDecision = selectPlanningRuntimeProductRoute({
      taskKind: "read-file",
      reason: "targeted read intent requires explicit readable target",
      inspectFirst: true,
      verifyAfterEdit: false,
      targetMissing: true,
      blockedReason: "Provide an explicit in-workspace file path.",
    });
    expect(readDecision).toMatchObject({
      shouldRun: true,
      routeKind: "blocked-vague-read",
      taskKind: "read-file",
    });

    const inspectDecision = selectPlanningRuntimeProductRoute({
      taskKind: "inspect-files",
      reason: "read/inspect intent without explicit in-workspace target",
      inspectFirst: true,
      verifyAfterEdit: false,
    });
    expect(inspectDecision).toMatchObject({
      shouldRun: true,
      routeKind: "vague-inspect",
      taskKind: "inspect-files",
    });

    const repoDecision = selectPlanningRuntimeProductRoute({
      taskKind: "repo-explain",
      reason: "repo diagnosis intent",
      inspectFirst: true,
      verifyAfterEdit: false,
    });
    expect(repoDecision).toMatchObject({
      shouldRun: true,
      routeKind: "vague-repo-explain",
      taskKind: "repo-explain",
    });
  });

  it("rejects explicit targets and command-only tasks without creating mutation targets", () => {
    expect(
      selectPlanningRuntimeProductRoute({
        taskKind: "edit-file",
        reason: "edit intent with explicit target",
        targetPath: "src/example.ts",
        inspectFirst: false,
        verifyAfterEdit: false,
        blockedReason: "edit-transform-unclear",
        targetMissing: false,
      }),
    ).toMatchObject({ shouldRun: false });

    const commandPlan: WorkflowTaskPlan = {
      taskKind: "run-command",
      reason: "explicit run-command intent",
      inspectFirst: false,
      verifyAfterEdit: false,
      directCommand: "npm publish",
      blockedReason: "command not allowlisted",
    };
    expect(selectPlanningRuntimeProductRoute(commandPlan)).toMatchObject({ shouldRun: false });
    expect(shouldRunPlanningRuntimeForBlockedVagueTask(commandPlan)).toBe(false);
    expect(commandPlan.targetPath).toBeUndefined();
  });
});
