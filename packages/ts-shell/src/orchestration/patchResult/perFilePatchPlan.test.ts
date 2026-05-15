import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPerFilePatchPlan,
  projectPerFilePatchResult,
} from "./perFilePatchPlan.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("buildPerFilePatchPlan", () => {
  it("projects a single-file update plan to a supported write intent", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      {
        "src/app.ts": "old\n",
      },
    );

    expectSupportedWritePlan(plan, ["src/app.ts"]);
    expect(plan.operations).toEqual([
      expect.objectContaining({
        operationKind: "update",
        targetPath: "src/app.ts",
        supportStatus: "supported-write",
        writeIntent: "eligible",
        verificationExpectation: "route-owned-write-preflight",
      }),
    ]);
  });

  it("projects a single-file create plan to a supported write intent", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+ready",
        "*** End Patch",
      ],
      {},
      { existingDirectories: ["src"] },
    );

    expectSupportedWritePlan(plan, ["src/new.ts"]);
    expect(plan.operations[0]).toEqual(
      expect.objectContaining({
        operationKind: "create",
        targetPath: "src/new.ts",
        supportStatus: "supported-write",
        writeIntent: "eligible",
      }),
    );
  });

  it("projects exactly-two updates to supported write intents", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: src/b.ts",
        "@@",
        "-b",
        "+bb",
        "*** End Patch",
      ],
      {
        "src/a.ts": "a\n",
        "src/b.ts": "b\n",
      },
    );

    expectSupportedWritePlan(plan, ["src/a.ts", "src/b.ts"]);
    expect(plan.operations.map((operation) => operation.operationKind)).toEqual([
      "update",
      "update",
    ]);
  });

  it("projects exactly-three updates to supported write intents", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: src/b.ts",
        "@@",
        "-b",
        "+bb",
        "*** Update File: src/c.ts",
        "@@",
        "-c",
        "+cc",
        "*** End Patch",
      ],
      {
        "src/a.ts": "a\n",
        "src/b.ts": "b\n",
        "src/c.ts": "c\n",
      },
    );

    expectSupportedWritePlan(plan, ["src/a.ts", "src/b.ts", "src/c.ts"]);
    expect(plan.operations.every((operation) => operation.writeIntent === "eligible")).toBe(
      true,
    );
    expect(plan.operations.map((operation) => operation.operationKind)).toEqual([
      "update",
      "update",
      "update",
    ]);
  });

  it("projects 3+ update beyond exactly-three to unsupported/no-write", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: src/b.ts",
        "@@",
        "-b",
        "+bb",
        "*** Update File: src/c.ts",
        "@@",
        "-c",
        "+cc",
        "*** Update File: src/d.ts",
        "@@",
        "-d",
        "+dd",
        "*** End Patch",
      ],
      {
        "src/a.ts": "a\n",
        "src/b.ts": "b\n",
        "src/c.ts": "c\n",
        "src/d.ts": "d\n",
      },
    );

    expectUnsupportedNoWritePlan(plan, "too-many-update-files");
    expect(plan.summary.writeIntentFiles).toEqual([]);
    expect(plan.summary.plannedFiles).toEqual([]);
    expect(plan.summary.failedFiles.map((failure) => failure.path)).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
      "src/d.ts",
    ]);
  });

  it("projects delete to a supported write intent", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Delete File: src/remove.ts",
        "*** End Patch",
      ],
      {
        "src/remove.ts": "remove\n",
      },
    );

    expectSupportedWritePlan(plan, ["src/remove.ts"]);
    expect(plan.operations[0]).toEqual(
      expect.objectContaining({
        operationKind: "delete",
        targetPath: "src/remove.ts",
        supportStatus: "supported-write",
        writeIntent: "eligible",
      }),
    );
  });

  it("projects a pure move to a supported write intent with source and target paths", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/from.ts",
        "*** Move to: src/to.ts",
        "@@",
        " from",
        "*** End Patch",
      ],
      {
        "src/from.ts": "from\n",
      },
    );

    expectSupportedWritePlan(plan, ["src/to.ts"]);
    expect(plan.operations[0]).toEqual(
      expect.objectContaining({
        operationKind: "move",
        sourcePath: "src/from.ts",
        targetPath: "src/to.ts",
        supportStatus: "supported-write",
        writeIntent: "eligible",
      }),
    );
  });

  it("projects move with content edits to unsupported/no-write", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/from.ts",
        "*** Move to: src/to.ts",
        "@@",
        "-from",
        "+to",
        "*** End Patch",
      ],
      {
        "src/from.ts": "from\n",
      },
    );

    expectUnsupportedNoWritePlan(plan, "unsupported-operation");
    expect(plan.operations[0]).toEqual(
      expect.objectContaining({
        operationKind: "move",
        sourcePath: "src/from.ts",
        targetPath: "src/to.ts",
        supportStatus: "unsupported-no-write",
        writeIntent: "none",
      }),
    );
  });

  it("projects broad apply_patch or unified diff text to unsupported/no-write", () => {
    const plan = planFromPatch(
      [
        "diff --git a/src/app.ts b/src/app.ts",
        "--- a/src/app.ts",
        "+++ b/src/app.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
      ],
      {
        "src/app.ts": "old\n",
      },
    );

    expectUnsupportedNoWritePlan(plan, "broad-apply-patch");
    expect(plan.operations[0]).toEqual(
      expect.objectContaining({
        operationKind: "broad",
        supportStatus: "unsupported-no-write",
        writeIntent: "none",
        verificationExpectation: "not-run-unsupported",
      }),
    );
  });

  it("projects broad apply_patch with multiple targets without write intent", () => {
    const plan = planFromPatch(
      [
        "diff --git a/src/app.ts b/src/app.ts",
        "--- a/src/app.ts",
        "+++ b/src/app.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
        "diff --git a/src/other.ts b/src/other.ts",
        "--- a/src/other.ts",
        "+++ b/src/other.ts",
        "@@ -1 +1 @@",
        "-other",
        "+changed",
      ],
      {
        "src/app.ts": "old\n",
        "src/other.ts": "other\n",
      },
    );

    expectUnsupportedNoWritePlan(plan, "broad-apply-patch");
    expect(plan.summary.targetFiles).toEqual(["src/app.ts", "src/other.ts"]);
    expect(plan.summary.writeIntentFiles).toEqual([]);
    expect(plan.operations).toEqual([
      expect.objectContaining({
        operationKind: "broad",
        targetPath: "src/app.ts",
        writeIntent: "none",
      }),
      expect.objectContaining({
        operationKind: "broad",
        targetPath: "src/other.ts",
        writeIntent: "none",
      }),
    ]);
  });

  it("projects broad apply_patch with an external target as unsupported/no-write", () => {
    const plan = planFromPatch(
      [
        "diff --git a/src/app.ts b/src/app.ts",
        "--- a/src/app.ts",
        "+++ b/src/app.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
        "diff --git a/../outside.ts b/../outside.ts",
        "--- a/../outside.ts",
        "+++ b/../outside.ts",
        "@@ -1 +1 @@",
        "-outside",
        "+changed",
      ],
      {
        "src/app.ts": "old\n",
      },
    );

    expectUnsupportedNoWritePlan(plan, "broad-apply-patch");
    expect(plan.summary.targetFiles).toEqual(["src/app.ts", "../outside.ts"]);
    expect(plan.summary.failedFiles).toEqual([
      expect.objectContaining({
        code: "patch-apply-plan-not-verified",
        path: "src/app.ts",
      }),
      expect.objectContaining({
        code: "patch-verify-path-outside-workspace",
        path: "../outside.ts",
      }),
    ]);
    expect(plan.operations[1]).toEqual(
      expect.objectContaining({
        operationKind: "broad",
        targetPath: "../outside.ts",
        failedFile: expect.objectContaining({
          code: "patch-verify-path-outside-workspace",
        }),
      }),
    );
  });

  it("accepts a fenced markdown patch with surrounding prose as the same supported update plan", () => {
    const plan = planFromPatch(
      [
        "I will make the requested change.",
        "```diff",
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
        "```",
        "Done.",
      ].join("\n"),
      {
        "src/app.ts": "old\n",
      },
    );

    expectSupportedWritePlan(plan, ["src/app.ts"]);
    expect(plan.operations).toEqual([
      expect.objectContaining({
        operationKind: "update",
        targetPath: "src/app.ts",
        supportStatus: "supported-write",
        writeIntent: "eligible",
      }),
    ]);
  });

  it("projects malformed patch text to invalid model output", () => {
    const plan = planFromPatch("not a patch", {});

    expect(plan.summary).toEqual(
      expect.objectContaining({
        supportStatus: "invalid-model-output",
        failureClass: "parse-failure",
        writeIntentFiles: [],
        plannedFiles: [],
        changedFiles: [],
        willWrite: false,
        writerInvoked: false,
        workspaceWriterInvoked: false,
        writerInvocationCondition: "never",
      }),
    );
    expect(plan.operations[0]).toEqual(
      expect.objectContaining({
        operationKind: "malformed",
        supportStatus: "invalid-model-output",
        writeIntent: "none",
        verificationExpectation: "not-run-invalid-model-output",
      }),
    );
  });

  it.each([
    {
      name: "success-like text without a patch",
      rawPatchText: "Done. I updated src/app.ts successfully.",
      expectedOperationKind: "malformed",
    },
    {
      name: "empty model output",
      rawPatchText: " \n\t\n ",
      expectedOperationKind: "malformed",
    },
    {
      name: "unknown operation kind",
      rawPatchText: [
        "*** Begin Patch",
        "*** Rename File: src/a.ts -> src/b.ts",
        "*** End Patch",
      ].join("\n"),
      expectedOperationKind: "unknown",
    },
    {
      name: "malformed update header",
      rawPatchText: [
        "*** Begin Patch",
        "*** Update File:",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ].join("\n"),
      expectedOperationKind: "malformed",
    },
    {
      name: "unsupported hunk body shape",
      rawPatchText: [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "old",
        "+new",
        "*** End Patch",
      ].join("\n"),
      expectedOperationKind: "malformed",
    },
  ])(
    "projects $name to invalid model output without write intent",
    ({ rawPatchText, expectedOperationKind }) => {
      const plan = planFromPatch(rawPatchText, {
        "src/app.ts": "old\n",
      });

      expect(plan.summary).toEqual(
        expect.objectContaining({
          supportStatus: "invalid-model-output",
          failureClass: "parse-failure",
          writeIntentFiles: [],
          plannedFiles: [],
          changedFiles: [],
          willWrite: false,
          writerInvoked: false,
          workspaceWriterInvoked: false,
          postWriteVerification: "not-run",
          writerInvocationCondition: "never",
        }),
      );
      expect(plan.operations[0]).toEqual(
        expect.objectContaining({
          operationKind: expectedOperationKind,
          supportStatus: "invalid-model-output",
          writeIntent: "none",
          verificationExpectation: "not-run-invalid-model-output",
        }),
      );
    },
  );

  it("projects exactly-two mixed operations to supported write intents", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** Delete File: src/remove.ts",
        "*** End Patch",
      ],
      {
        "src/app.ts": "old\n",
        "src/remove.ts": "remove\n",
      },
    );

    expectSupportedWritePlan(plan, ["src/app.ts", "src/remove.ts"]);
    expect(plan.summary.targetFiles).toEqual(["src/app.ts", "src/remove.ts"]);
    expect(plan.summary.writeIntentFiles).toEqual([
      "src/app.ts",
      "src/remove.ts",
    ]);
    expect(plan.operations.map((operation) => operation.supportStatus)).toEqual([
      "supported-write",
      "supported-write",
    ]);
    expect(plan.operations).toEqual([
      expect.objectContaining({
        operationKind: "update",
        targetPath: "src/app.ts",
        writeIntent: "eligible",
      }),
      expect.objectContaining({
        operationKind: "delete",
        targetPath: "src/remove.ts",
        writeIntent: "eligible",
      }),
    ]);
  });

  it("projects update, create, and delete mixes to supported exactly-three write intents", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** Add File: src/new.ts",
        "+created",
        "*** Delete File: src/remove.ts",
        "*** End Patch",
      ],
      {
        "src/app.ts": "old\n",
        "src/remove.ts": "remove\n",
      },
      { existingDirectories: ["src"] },
    );

    expectSupportedWritePlan(plan, ["src/app.ts", "src/new.ts", "src/remove.ts"]);
    expect(plan.summary.targetFiles).toEqual([
      "src/app.ts",
      "src/new.ts",
      "src/remove.ts",
    ]);
    expect(plan.summary.writeIntentFiles).toEqual([
      "src/app.ts",
      "src/new.ts",
      "src/remove.ts",
    ]);
    expect(plan.summary.failedFiles).toEqual([]);
    expect(plan.operations).toEqual([
      expect.objectContaining({ operationKind: "update", writeIntent: "eligible" }),
      expect.objectContaining({ operationKind: "create", writeIntent: "eligible" }),
      expect.objectContaining({ operationKind: "delete", writeIntent: "eligible" }),
    ]);
  });

  it("keeps 4+ mixed operations unsupported/no-write", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** Add File: src/new.ts",
        "+created",
        "*** Delete File: src/remove.ts",
        "*** Update File: src/from.ts",
        "*** Move to: src/to.ts",
        "@@",
        " from",
        "*** End Patch",
      ],
      {
        "src/app.ts": "old\n",
        "src/remove.ts": "remove\n",
        "src/from.ts": "from\n",
      },
      { existingDirectories: ["src"] },
    );

    expectUnsupportedNoWritePlan(plan, "mixed-operations");
    expect(plan.summary.writeIntentFiles).toEqual([]);
    expect(plan.summary.mixedOperationReadiness).toEqual(
      expect.objectContaining({
        operationCount: 4,
        routeBlocker: "mixed-operation-route-not-enabled",
        mixedWritesEnabled: false,
      }),
    );
  });

  it("keeps create plus move with content edits unsupported/no-write with source and target", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+created",
        "*** Update File: src/from.ts",
        "*** Move to: src/to.ts",
        "@@",
        "-from",
        "+to",
        "*** End Patch",
      ],
      {
        "src/from.ts": "from\n",
      },
      { existingDirectories: ["src"] },
    );

    expectUnsupportedNoWritePlan(plan, "unsupported-operation");
    expect(plan.operations).toEqual([
      expect.objectContaining({
        operationKind: "create",
        targetPath: "src/new.ts",
        writeIntent: "none",
      }),
      expect.objectContaining({
        operationKind: "move",
        sourcePath: "src/from.ts",
        targetPath: "src/to.ts",
        writeIntent: "none",
      }),
    ]);
  });

  it.each([
    {
      name: "update plus create",
      patch: [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** Add File: src/new.ts",
        "+created",
        "*** End Patch",
      ],
      files: { "src/app.ts": "old\n" },
      directories: ["src"],
      operationKinds: ["update", "create"],
      targets: ["src/app.ts", "src/new.ts"],
    },
    {
      name: "update plus delete",
      patch: [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** Delete File: src/remove.ts",
        "*** End Patch",
      ],
      files: {
        "src/app.ts": "old\n",
        "src/remove.ts": "remove\n",
      },
      operationKinds: ["update", "delete"],
      targets: ["src/app.ts", "src/remove.ts"],
    },
    {
      name: "update plus move",
      patch: [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** Update File: src/from.ts",
        "*** Move to: src/to.ts",
        "@@",
        " from",
        "*** End Patch",
      ],
      files: {
        "src/app.ts": "old\n",
        "src/from.ts": "from\n",
      },
      operationKinds: ["update", "move"],
      targets: ["src/app.ts", "src/to.ts"],
    },
    {
      name: "create plus delete",
      patch: [
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+created",
        "*** Delete File: src/remove.ts",
        "*** End Patch",
      ],
      files: { "src/remove.ts": "remove\n" },
      directories: ["src"],
      operationKinds: ["create", "delete"],
      targets: ["src/new.ts", "src/remove.ts"],
    },
    {
      name: "create plus move",
      patch: [
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+created",
        "*** Update File: src/from.ts",
        "*** Move to: src/to.ts",
        "@@",
        " from",
        "*** End Patch",
      ],
      files: { "src/from.ts": "from\n" },
      directories: ["src"],
      operationKinds: ["create", "move"],
      targets: ["src/new.ts", "src/to.ts"],
    },
    {
      name: "delete plus move",
      patch: [
        "*** Begin Patch",
        "*** Delete File: src/remove.ts",
        "*** Update File: src/from.ts",
        "*** Move to: src/to.ts",
        "@@",
        " from",
        "*** End Patch",
      ],
      files: {
        "src/remove.ts": "remove\n",
        "src/from.ts": "from\n",
      },
      operationKinds: ["delete", "move"],
      targets: ["src/remove.ts", "src/to.ts"],
    },
  ])(
    "projects $name as exactly-two mixed supported-write evidence",
    ({ patch, files, directories, operationKinds, targets }) => {
      const plan = planFromPatch(patch, files, {
        existingDirectories: directories,
      });
      const result = projectPerFilePatchResult({ plan });

      expectSupportedWritePlan(plan, targets);
      expect(plan.summary.targetFiles).toEqual(targets);
      expect(plan.summary.failedFiles).toEqual([]);
      expect(plan.operations.map((operation) => operation.operationKind)).toEqual(
        operationKinds,
      );
      expect(plan.summary.mixedOperationReadiness).toBeUndefined();
      expect(result).toEqual(
        expect.objectContaining({
          supportStatus: "supported-write",
          failureClass: "none",
          writeIntentFiles: targets,
          changedFiles: [],
          plannedFiles: [],
          failedFiles: [],
          writerInvoked: false,
          creatorInvoked: false,
          deleteMoveInvoked: false,
          postWriteVerification: "not-run",
          successLike: false,
        }),
      );
      expect(result.evidence).toEqual(
        expect.arrayContaining([
          "per-file-patch-result:no-writer-invoked",
          "per-file-patch-result:no-creator-invoked",
          "per-file-patch-result:no-delete-move-invoked",
          "per-file-patch-result:no-success-claim",
        ]),
      );
    },
  );

  it("projects duplicate update targets to unsupported/no-write before writer reachability", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** Update File: src/app.ts",
        "@@",
        "-new",
        "+newer",
        "*** End Patch",
      ],
      {
        "src/app.ts": "old\n",
      },
    );

    expectUnsupportedNoWritePlan(plan, "duplicate-target");
    expect(plan.summary.targetFiles).toEqual(["src/app.ts", "src/app.ts"]);
    expect(plan.summary.failedFiles).toEqual([
      expect.objectContaining({
        code: "patch-apply-plan-not-verified",
        path: "src/app.ts",
      }),
    ]);
    expect(plan.operations).toEqual([
      expect.objectContaining({
        operationKind: "update",
        targetPath: "src/app.ts",
        writeIntent: "none",
      }),
      expect.objectContaining({
        operationKind: "update",
        targetPath: "src/app.ts",
        writeIntent: "none",
      }),
    ]);
  });

  it("projects duplicate delete and move targets to unsupported/no-write", () => {
    const duplicateDelete = planFromPatch(
      [
        "*** Begin Patch",
        "*** Delete File: src/remove.ts",
        "*** Delete File: src/remove.ts",
        "*** End Patch",
      ],
      {
        "src/remove.ts": "remove\n",
      },
    );
    const duplicateMoveTarget = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "*** Move to: src/same.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: src/b.ts",
        "*** Move to: src/same.ts",
        "@@",
        "-b",
        "+bb",
        "*** End Patch",
      ],
      {
        "src/a.ts": "a\n",
        "src/b.ts": "b\n",
      },
    );

    expectUnsupportedNoWritePlan(duplicateDelete, "duplicate-target");
    expect(duplicateDelete.summary.failedFiles).toEqual([
      expect.objectContaining({ path: "src/remove.ts" }),
    ]);
    expectUnsupportedNoWritePlan(duplicateMoveTarget, "duplicate-target");
    expect(duplicateMoveTarget.summary.failedFiles).toEqual([
      expect.objectContaining({ path: "src/same.ts" }),
    ]);
    expect(duplicateMoveTarget.operations).toEqual([
      expect.objectContaining({
        operationKind: "move",
        sourcePath: "src/a.ts",
        targetPath: "src/same.ts",
      }),
      expect.objectContaining({
        operationKind: "move",
        sourcePath: "src/b.ts",
        targetPath: "src/same.ts",
      }),
    ]);
  });

  it("projects paths outside the selected workspace to unsupported/no-write", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: ../outside.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      {
        "../outside.ts": "old\n",
      },
    );

    expectUnsupportedNoWritePlan(plan, "workspace-boundary");
    expect(plan.summary.failedFiles).toEqual([
      expect.objectContaining({
        code: "patch-verify-path-outside-workspace",
        path: "../outside.ts",
      }),
    ]);
  });

  it("projects outside-workspace delete and move paths to unsupported/no-write", () => {
    const deletePlan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Delete File: ../outside.ts",
        "*** End Patch",
      ],
      {},
    );
    const moveSourcePlan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: ../outside.ts",
        "*** Move to: src/to.ts",
        "@@",
        "-outside",
        "+to",
        "*** End Patch",
      ],
      {},
    );
    const moveTargetPlan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/from.ts",
        "*** Move to: ../outside.ts",
        "@@",
        "-from",
        "+to",
        "*** End Patch",
      ],
      {
        "src/from.ts": "from\n",
      },
    );

    for (const plan of [deletePlan, moveSourcePlan, moveTargetPlan]) {
      expectUnsupportedNoWritePlan(plan, "workspace-boundary");
      expect(plan.summary.failedFiles).toEqual([
        expect.objectContaining({
          code: "patch-verify-path-outside-workspace",
        }),
      ]);
    }
    expect(moveTargetPlan.operations[0]).toEqual(
      expect.objectContaining({
        operationKind: "move",
        sourcePath: "src/from.ts",
        targetPath: "../outside.ts",
        failedFile: expect.objectContaining({
          path: "../outside.ts",
        }),
      }),
    );
  });

  it("projects missing update targets to unsupported/no-write", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/missing.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      {},
    );

    expectUnsupportedNoWritePlan(plan, "missing-target");
    expect(plan.summary.failedFiles).toEqual([
      expect.objectContaining({
        code: "patch-verify-file-missing",
        path: "src/missing.ts",
      }),
    ]);
  });

  it("projects delete with a missing target to unsupported/no-write", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Delete File: src/missing.ts",
        "*** End Patch",
      ],
      {},
    );

    expectUnsupportedNoWritePlan(plan, "missing-target");
    expect(plan.summary.failedFiles).toEqual([
      expect.objectContaining({
        code: "patch-verify-file-missing",
        path: "src/missing.ts",
      }),
    ]);
    expect(plan.operations[0]).toEqual(
      expect.objectContaining({
        operationKind: "delete",
        targetPath: "src/missing.ts",
        failedFile: expect.objectContaining({ path: "src/missing.ts" }),
      }),
    );
  });

  it("projects move with a missing source to unsupported/no-write", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/missing.ts",
        "*** Move to: src/to.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      {},
    );

    expectUnsupportedNoWritePlan(plan, "missing-target");
    expect(plan.summary.failedFiles).toEqual([
      expect.objectContaining({
        code: "patch-verify-file-missing",
        path: "src/missing.ts",
      }),
    ]);
    expect(plan.operations[0]).toEqual(
      expect.objectContaining({
        operationKind: "move",
        sourcePath: "src/missing.ts",
        targetPath: "src/to.ts",
        failedFile: expect.objectContaining({ path: "src/missing.ts" }),
      }),
    );
  });

  it("projects move with a missing destination as invalid model output", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/from.ts",
        "*** Move to:",
        "@@",
        "-from",
        "+to",
        "*** End Patch",
      ],
      {
        "src/from.ts": "from\n",
      },
    );

    expect(plan.summary).toEqual(
      expect.objectContaining({
        supportStatus: "invalid-model-output",
        failureClass: "parse-failure",
        writeIntentFiles: [],
        changedFiles: [],
        failedFiles: [
          expect.objectContaining({
            code: "patch-parse-invalid-format",
          }),
        ],
      }),
    );
    expect(plan.operations[0]).toEqual(
      expect.objectContaining({
        operationKind: "malformed",
        supportStatus: "invalid-model-output",
        writeIntent: "none",
      }),
    );
  });

  it("keeps changed and failed file projections distinct from write-intent files", () => {
    const supported = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      {
        "src/app.ts": "old\n",
      },
    );
    const supportedResult = projectPerFilePatchResult({
      plan: supported,
      changedFiles: ["src/app.ts"],
      writerInvoked: true,
      postWriteVerification: "passed",
    });

    expect(supportedResult).toEqual(
      expect.objectContaining({
        changedFiles: ["src/app.ts"],
        plannedFiles: [],
        failedFiles: [],
        writerInvoked: true,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );

    const threeFileWrite = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: src/b.ts",
        "@@",
        "-b",
        "+bb",
        "*** Update File: src/c.ts",
        "@@",
        "-c",
        "+cc",
        "*** End Patch",
      ],
      {
        "src/a.ts": "a\n",
        "src/b.ts": "b\n",
        "src/c.ts": "c\n",
      },
    );
    const threeFileResult = projectPerFilePatchResult({ plan: threeFileWrite });

    expect(threeFileResult).toEqual(
      expect.objectContaining({
        changedFiles: [],
        plannedFiles: [],
        failedFiles: [],
        writerInvoked: false,
        postWriteVerification: "not-run",
        successLike: false,
      }),
    );
    expect(threeFileResult.writeIntentFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);

    const unsupported = planFromPatch(
      [
        "*** Begin Patch",
        "*** Delete File: src/missing.ts",
        "*** End Patch",
      ],
      {},
    );
    const unsupportedResult = projectPerFilePatchResult({ plan: unsupported });

    expect(unsupportedResult.changedFiles).toEqual([]);
    expect(unsupportedResult.plannedFiles).toEqual([]);
    expect(unsupportedResult.failedFiles).toEqual([
      expect.objectContaining({ path: "src/missing.ts" }),
    ]);
    expect(unsupportedResult.successLike).toBe(false);
  });

  it("keeps writer invocation false for unsupported/no-write plans", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Delete File: src/missing.ts",
        "*** End Patch",
      ],
      {},
    );
    const result = projectPerFilePatchResult({ plan });

    expect(plan.summary.willWrite).toBe(false);
    expect(plan.summary.writerInvoked).toBe(false);
    expect(plan.summary.workspaceWriterInvoked).toBe(false);
    expect(plan.summary.postWriteVerification).toBe("not-run");
    expect(result.writerInvoked).toBe(false);
    expect(result.successLike).toBe(false);
  });

  it("projects stale-read as a stopped no-write runtime failure", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      {
        "src/app.ts": "old\n",
      },
    );

    const result = projectPerFilePatchResult({
      plan,
      failedFiles: [
        {
          path: "src/app.ts",
          reason:
            "stale-read: Target file changed since it was read for this edit.",
        },
      ],
      writerInvoked: false,
      postWriteVerification: "not-run",
    });

    expect(result).toEqual(
      expect.objectContaining({
        failureClass: "stale-read",
        changedFiles: [],
        failedFiles: [
          {
            path: "src/app.ts",
            reason:
              "stale-read: Target file changed since it was read for this edit.",
          },
        ],
        writerInvoked: false,
        postWriteVerification: "not-run",
        successLike: false,
      }),
    );
    expect(result.operations[0]).toEqual(
      expect.objectContaining({
        targetPath: "src/app.ts",
        failedFile: {
          path: "src/app.ts",
          reason:
            "stale-read: Target file changed since it was read for this edit.",
        },
      }),
    );
  });

  it("projects partial writer failure with only verified changed files", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: src/b.ts",
        "@@",
        "-b",
        "+bb",
        "*** End Patch",
      ],
      {
        "src/a.ts": "a\n",
        "src/b.ts": "b\n",
      },
    );

    const result = projectPerFilePatchResult({
      plan,
      changedFiles: ["src/a.ts"],
      failedFiles: [
        {
          path: "src/b.ts",
          reason: "Patch write failed: simulated second writer failure",
        },
      ],
      writerInvoked: true,
      postWriteVerification: "blocked",
    });

    expect(result.failureClass).toBe("partial-failure");
    expect(result.changedFiles).toEqual(["src/a.ts"]);
    expect(result.failedFiles).toEqual([
      {
        path: "src/b.ts",
        reason: "Patch write failed: simulated second writer failure",
      },
    ]);
    expect(result.successLike).toBe(false);
    expect(result.evidence).toEqual(
      expect.arrayContaining(["per-file-patch-result:partial-failure-surface"]),
    );
    expect(result.operations).toEqual([
      expect.objectContaining({
        targetPath: "src/a.ts",
        changedFile: "src/a.ts",
      }),
      expect.objectContaining({
        targetPath: "src/b.ts",
        failedFile: {
          path: "src/b.ts",
          reason: "Patch write failed: simulated second writer failure",
        },
      }),
    ]);
  });

  it("projects post-write verification failure without success claims", () => {
    const plan = planFromPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      {
        "src/app.ts": "old\n",
      },
    );

    const result = projectPerFilePatchResult({
      plan,
      failedFiles: [
        {
          path: "src/app.ts",
          reason:
            "Patch update post-write verification failed: readback did not match planned content.",
        },
      ],
      writerInvoked: true,
      postWriteVerification: "failed",
    });

    expect(result).toEqual(
      expect.objectContaining({
        failureClass: "post-write-verification",
        changedFiles: [],
        writerInvoked: true,
        postWriteVerification: "failed",
        successLike: false,
      }),
    );
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "per-file-patch-result:post-write-verification-failed",
        "per-file-patch-result:no-success-claim",
      ]),
    );
  });
});

function expectSupportedWritePlan(
  plan: ReturnType<typeof buildPerFilePatchPlan>,
  writeIntentFiles: readonly string[],
): void {
  expect(plan.summary).toEqual(
    expect.objectContaining({
      supportStatus: "supported-write",
      failureClass: "none",
      targetFiles: [...writeIntentFiles],
      writeIntentFiles: [...writeIntentFiles],
      plannedFiles: [],
      changedFiles: [],
      failedFiles: [],
      willWrite: false,
      writerInvoked: false,
      workspaceWriterInvoked: false,
      postWriteVerification: "not-run",
      writerInvocationCondition: "existing-explicit-route-only",
    }),
  );
}

function expectUnsupportedNoWritePlan(
  plan: ReturnType<typeof buildPerFilePatchPlan>,
  failureClass: string,
): void {
  expect(plan.summary).toEqual(
    expect.objectContaining({
      supportStatus: "unsupported-no-write",
      failureClass,
      writeIntentFiles: [],
      plannedFiles: [],
      changedFiles: [],
      willWrite: false,
      writerInvoked: false,
      workspaceWriterInvoked: false,
      postWriteVerification: "not-run",
      writerInvocationCondition: "never",
    }),
  );
  expect(plan.summary.failedFiles.length).toBeGreaterThan(0);
  expect(plan.operations.every((operation) => operation.writeIntent === "none")).toBe(
    true,
  );
}

function planFromPatch(
  rawPatchText: string | readonly string[],
  files: Record<string, string>,
  options?: { readonly existingDirectories?: readonly string[] },
): ReturnType<typeof buildPerFilePatchPlan> {
  return buildPerFilePatchPlan({
    workspaceRoot,
    rawPatchText: Array.isArray(rawPatchText)
      ? rawPatchText.join("\n")
      : rawPatchText,
    readFile: (absolutePath) => {
      const relative = relativeWorkspacePath(absolutePath);
      return files[relative];
    },
    directoryExists: (absolutePath) => {
      const relative = relativeWorkspacePath(absolutePath);
      return options?.existingDirectories?.includes(relative) ?? false;
    },
  });
}

function relativeWorkspacePath(absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).replace(/\\/g, "/");
}
