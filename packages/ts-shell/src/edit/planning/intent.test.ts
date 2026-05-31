import { describe, expect, it } from "vitest";

import {
  buildMissingMutationTargetPlan,
  buildOutOfWorkspaceMutationTargetPlan,
  buildUnclearEditTransformPlan,
  buildUnsupportedDiscoveryEditPlan,
  selectMutationIntentTarget,
} from "./intent.js";

describe("mutationIntentPlanning", () => {
  it("selects mutation targets only for write/edit intents", () => {
    const targets = [{ cleaned: "src/a.ts" }, { cleaned: "src/b.ts" }];

    expect(
      selectMutationIntentTarget({
        prompt: "Edit src/b.ts after reading src/a.ts",
        targets,
        hasWriteTaskIntent: false,
        hasEditIntent: true,
      })?.cleaned,
    ).toBe("src/b.ts");

    expect(
      selectMutationIntentTarget({
        prompt: "Read src/b.ts",
        targets,
        hasWriteTaskIntent: false,
        hasEditIntent: false,
      }),
    ).toBeUndefined();
  });

  it("keeps missing mutation targets blocked", () => {
    const plan = buildMissingMutationTargetPlan({
      hasWriteTaskIntent: false,
      hasVerifyIntent: true,
      verifyCommand: "npm test",
      replaceDirective: { from: "old", to: "new" },
      editDoNext: "Provide a target.",
      usedRestoredState: false,
    });

    expect(plan).toMatchObject({
      taskKind: "edit-file",
      targetMissing: true,
      verifyAfterEdit: true,
      verifyCommand: "npm test",
      replaceFrom: "old",
      replaceTo: "new",
      usedRestoredState: false,
    });
    expect(plan.blockedReason).toContain("edit-target-missing");
  });

  it("keeps out-of-workspace targets blocked", () => {
    const plan = buildOutOfWorkspaceMutationTargetPlan({
      hasWriteTaskIntent: true,
      hasVerifyIntent: false,
      targetPath: "../outside.ts",
      usedRestoredState: true,
    });

    expect(plan).toMatchObject({
      taskKind: "write-file",
      targetPath: "../outside.ts",
      inspectFirst: false,
      verifyAfterEdit: false,
      usedRestoredState: true,
    });
    expect(plan.blockedReason).toContain("outside current workspace");
  });

  it("keeps unclear transforms as context planning requests, not edits", () => {
    const plan = buildUnclearEditTransformPlan({
      targetPath: "src/app.ts",
      usedRestoredState: false,
    });

    expect(plan).toMatchObject({
      taskKind: "edit-file",
      targetPath: "src/app.ts",
      targetMissing: false,
      contextPlanningRequested: true,
      contextPlanningReason: "missing-edit-context",
      verifyAfterEdit: false,
    });
    expect(plan.blockedReason).toContain("edit-transform-unclear");
  });

  it("keeps discovery edit unsupported", () => {
    const plan = buildUnsupportedDiscoveryEditPlan({
      doNext: "Inspect first.",
      usedRestoredState: false,
    });

    expect(plan).toMatchObject({
      taskKind: "edit-file",
      targetMissing: true,
      verifyAfterEdit: false,
    });
    expect(plan.blockedReason).toContain("Discovery edit is unsupported");
  });
});
