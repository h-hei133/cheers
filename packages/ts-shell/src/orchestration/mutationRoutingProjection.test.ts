import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  projectApplyPatchRuntimeMutationRoute,
  type MutationRoutingProjectionAuthority,
} from "./mutationRoutingProjection.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("apply_patch mutation routing projection", () => {
  it("returns undefined without runtime route options", async () => {
    let authorityRequested = false;

    const result = await projectApplyPatchRuntimeMutationRoute({
      sessionId: "session-1",
      prompt: singleFileUpdatePatch(),
      workspaceRoot: path.resolve("workspace"),
      getWorkspaceAuthority: () => {
        authorityRequested = true;
        throw new Error("workspace authority must not be requested");
      },
      readNoWriteRuntimeFile: () => {
        throw new Error("no-write reader must not be requested");
      },
    });

    expect(result).toBeUndefined();
    expect(authorityRequested).toBe(false);
  });

  it("projects no-write runtime routes without constructing workspace write authority", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    let authorityRequested = false;

    const result = await projectApplyPatchRuntimeMutationRoute({
      sessionId: "session-1",
      prompt: singleFileUpdatePatch(),
      workspaceRoot: fixture.workspaceRoot,
      routeOptions: {
        explicitRuntimeOptIn: true,
        requestedUserDecision: "approved",
      },
      getWorkspaceAuthority: () => {
        authorityRequested = true;
        throw new Error("workspace authority must not be requested");
      },
      readNoWriteRuntimeFile: readWorkspaceFile(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("stopped_error");
    expect(result?.terminalClassification).toBe("stopped");
    expect(result?.codingResult?.changedFiles).toEqual([]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: ["src/a.ts"],
        changedFiles: [],
        plannedFiles: [],
        writerInvoked: false,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        postWriteVerification: "not-run",
        successLike: false,
      }),
    );
    expect(result?.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-runtime-entrypoint:no-writer-invoked",
        "apply-patch-runtime-entrypoint:no-write-success",
      ]),
    );
    expect(authorityRequested).toBe(false);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("routes single Update File patches with supported-write per-file projection", async () => {
    const fixture = createFixture();

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, singleFileUpdatePatch()),
      getWorkspaceAuthority: () =>
        createWorkspaceWriteAuthority(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("completed");
    expect(result?.terminalClassification).toBe("success");
    expect(result?.codingResult?.changedFiles).toEqual(["src/a.ts"]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: ["src/a.ts"],
        changedFiles: ["src/a.ts"],
        plannedFiles: [],
        failedFiles: [],
        writerInvoked: true,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(result?.codingResult?.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({
        operationKind: "update",
        supportStatus: "supported-write",
        targetPath: "src/a.ts",
        writeIntent: "eligible",
      }),
    ]);
  });

  it("routes fenced patch output with surrounding prose as the same supported single-file update", async () => {
    const fixture = createFixture();

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, fencedSingleFileUpdatePatch()),
      getWorkspaceAuthority: () =>
        createWorkspaceWriteAuthority(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("completed");
    expect(result?.terminalClassification).toBe("success");
    expect(result?.codingResult?.changedFiles).toEqual(["src/a.ts"]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: ["src/a.ts"],
        changedFiles: ["src/a.ts"],
        writerInvoked: true,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("a = 2\n");
  });

  it("routes single Add File patches to the selected-workspace create projection", async () => {
    const fixture = createFixture();

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, addFilePatch()),
      getWorkspaceAuthority: () =>
        createWorkspaceWriteAuthority(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("completed");
    expect(result?.terminalClassification).toBe("success");
    expect(result?.codingResult?.changedFiles).toEqual(["src/new.ts"]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: ["src/new.ts"],
        changedFiles: ["src/new.ts"],
        plannedFiles: [],
        failedFiles: [],
        writerInvoked: true,
        creatorInvoked: true,
        deleteMoveInvoked: false,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(result?.codingResult?.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({
        operationKind: "create",
        supportStatus: "supported-write",
        targetPath: "src/new.ts",
        writeIntent: "eligible",
      }),
    ]);
    expect(readFile(fixture.workspaceRoot, "src/new.ts")).toBe("created");
  });

  it("routes exactly two Update File patches to the selected-workspace multi-file projection", async () => {
    const fixture = createFixture();

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, twoFileUpdatePatch()),
      getWorkspaceAuthority: () =>
        createWorkspaceWriteAuthority(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("completed");
    expect(result?.terminalClassification).toBe("success");
    expect(result?.codingResult?.changedFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: ["src/a.ts", "src/b.ts"],
        changedFiles: ["src/a.ts", "src/b.ts"],
        plannedFiles: [],
        failedFiles: [],
        writerInvoked: true,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(result?.codingResult?.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({ operationKind: "update", targetPath: "src/a.ts" }),
      expect.objectContaining({ operationKind: "update", targetPath: "src/b.ts" }),
    ]);
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("a = 2\n");
    expect(readFile(fixture.workspaceRoot, "src/b.ts")).toBe("b = 2\n");
  });

  it("projects exactly three Update File patches as no-write when workspace write is not opted in", async () => {
    const fixture = createFixture({ includeC: true });
    const before = snapshotFixture(fixture.workspaceRoot);
    let authorityRequested = false;

    const result = await projectApplyPatchRuntimeMutationRoute({
      sessionId: "session-1",
      prompt: threeFileUpdatePatch(),
      workspaceRoot: fixture.workspaceRoot,
      routeOptions: {
        explicitRuntimeOptIn: true,
        rawPatchText: threeFileUpdatePatch(),
        requestedUserDecision: "approved",
      },
      getWorkspaceAuthority: () => {
        authorityRequested = true;
        throw new Error("workspace authority must not be requested");
      },
      readNoWriteRuntimeFile: readWorkspaceFile(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("stopped_error");
    expect(result?.terminalClassification).toBe("stopped");
    expect(result?.codingResult?.changedFiles).toEqual([]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        writeIntentFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
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
    expect(authorityRequested).toBe(false);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("routes exactly three Update File patches to the selected-workspace multi-file projection", async () => {
    const fixture = createFixture({ includeC: true });

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, threeFileUpdatePatch()),
      getWorkspaceAuthority: () =>
        createWorkspaceWriteAuthority(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("completed");
    expect(result?.terminalClassification).toBe("success");
    expect(result?.codingResult?.changedFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
    expect(result?.codingResult?.changeSet.attemptedFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
        changedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
        plannedFiles: [],
        failedFiles: [],
        writerInvoked: true,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("a = 2\n");
    expect(readFile(fixture.workspaceRoot, "src/b.ts")).toBe("b = 2\n");
    expect(readFile(fixture.workspaceRoot, "src/c.ts")).toBe("c = 2\n");
  });

  it("routes exactly four Update File patches to the selected-workspace multi-file projection", async () => {
    const fixture = createFixture({ includeC: true, includeD: true });

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, fourFileUpdatePatch()),
      getWorkspaceAuthority: () =>
        createWorkspaceWriteAuthority(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("completed");
    expect(result?.terminalClassification).toBe("success");
    expect(result?.codingResult?.changedFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
      "src/d.ts",
    ]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"],
        changedFiles: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"],
        writerInvoked: true,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(readFile(fixture.workspaceRoot, "src/d.ts")).toBe("d = 2\n");
  });

  it("keeps 5+ Update File patches stopped before writer invocation", async () => {
    const fixture = createFixture({ includeC: true, includeD: true });
    const before = snapshotFixture(fixture.workspaceRoot);
    let writes = 0;

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, fiveFileUpdatePatch()),
      getWorkspaceAuthority: () =>
        authorityWithBlockedWriter(fixture.workspaceRoot, () => {
          writes += 1;
        }),
    });

    expect(result?.status).toBe("stopped_error");
    expect(result?.terminalClassification).toBe("stopped");
    expect(result?.codingResult?.changedFiles).toEqual([]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "unsupported-no-write",
        failureClass: "too-many-update-files",
        writeIntentFiles: [],
        changedFiles: [],
        plannedFiles: [],
        writerInvoked: false,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        postWriteVerification: "not-run",
        successLike: false,
      }),
    );
    expect(writes).toBe(0);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("routes Delete File patches through the guarded delete writer", async () => {
    const fixture = createFixture();

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, deleteFilePatch()),
      getWorkspaceAuthority: () =>
        createWorkspaceWriteAuthority(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("completed");
    expect(result?.terminalClassification).toBe("success");
    expect(result?.codingResult?.changedFiles).toEqual(["src/a.ts"]);
    expect(result?.codingResult?.failedFiles).toEqual([]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: ["src/a.ts"],
        changedFiles: ["src/a.ts"],
        plannedFiles: [],
        failedFiles: [],
        writerInvoked: true,
        creatorInvoked: false,
        deleteMoveInvoked: true,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(result?.codingResult?.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({
        operationKind: "delete",
        supportStatus: "supported-write",
        targetPath: "src/a.ts",
        writeIntent: "eligible",
      }),
    ]);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual({
      "src/b.ts": "b = 1\n",
    });
  });

  it("keeps Move File patches stopped with unsupported/no-write per-file projection", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    let writes = 0;

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, moveFilePatch()),
      getWorkspaceAuthority: () =>
        authorityWithBlockedWriter(fixture.workspaceRoot, () => {
          writes += 1;
        }),
    });

    expect(result?.status).toBe("stopped_error");
    expect(result?.terminalClassification).toBe("stopped");
    expect(result?.codingResult?.changedFiles).toEqual([]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "unsupported-no-write",
        failureClass: "unsupported-operation",
        writerInvoked: false,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        successLike: false,
      }),
    );
    expect(result?.codingResult?.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({
        operationKind: "move",
        sourcePath: "src/a.ts",
        targetPath: "src/moved.ts",
        writeIntent: "none",
      }),
    ]);
    expect(writes).toBe(0);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("routes pure Move File patches through the guarded move writer", async () => {
    const fixture = createFixture();

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, pureMoveFilePatch()),
      getWorkspaceAuthority: () =>
        createWorkspaceWriteAuthority(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("completed");
    expect(result?.terminalClassification).toBe("success");
    expect(result?.codingResult?.changedFiles).toEqual(["src/moved.ts"]);
    expect(result?.codingResult?.failedFiles).toEqual([]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: ["src/moved.ts"],
        changedFiles: ["src/moved.ts"],
        plannedFiles: [],
        failedFiles: [],
        writerInvoked: true,
        creatorInvoked: false,
        deleteMoveInvoked: true,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual({
      "src/b.ts": "b = 1\n",
      "src/moved.ts": "a = 1\n",
    });
  });

  it("keeps broad apply_patch stopped with unsupported/no-write per-file projection", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    let writes = 0;

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, broadPatch()),
      getWorkspaceAuthority: () =>
        authorityWithBlockedWriter(fixture.workspaceRoot, () => {
          writes += 1;
        }),
    });

    expect(result?.status).toBe("stopped_error");
    expect(result?.terminalClassification).toBe("stopped");
    expect(result?.codingResult?.changedFiles).toEqual([]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "unsupported-no-write",
        failureClass: "broad-apply-patch",
        writerInvoked: false,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        successLike: false,
      }),
    );
    expect(result?.codingResult?.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({
        operationKind: "broad",
        supportStatus: "unsupported-no-write",
        writeIntent: "none",
      }),
    ]);
    expect(writes).toBe(0);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("keeps duplicate target Update File patches stopped before writer invocation", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    let writes = 0;

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, duplicateTargetPatch()),
      getWorkspaceAuthority: () =>
        authorityWithBlockedWriter(fixture.workspaceRoot, () => {
          writes += 1;
        }),
    });

    expect(result?.status).toBe("stopped_error");
    expect(result?.terminalClassification).toBe("stopped");
    expect(result?.codingResult?.changedFiles).toEqual([]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "unsupported-no-write",
        failureClass: "duplicate-target",
        writeIntentFiles: [],
        changedFiles: [],
        plannedFiles: [],
        writerInvoked: false,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        postWriteVerification: "not-run",
        successLike: false,
      }),
    );
    expect(result?.codingResult?.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({
        operationKind: "update",
        targetPath: "src/a.ts",
        writeIntent: "none",
      }),
      expect.objectContaining({
        operationKind: "update",
        targetPath: "src/a.ts",
        writeIntent: "none",
      }),
    ]);
    expect(writes).toBe(0);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("keeps outside-workspace Update File patches stopped without writer invocation", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    let writes = 0;

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, outsideWorkspacePatch()),
      getWorkspaceAuthority: () =>
        authorityWithBlockedWriter(fixture.workspaceRoot, () => {
          writes += 1;
        }),
    });

    expect(result?.status).toBe("stopped_error");
    expect(result?.terminalClassification).toBe("stopped");
    expect(result?.codingResult?.changedFiles).toEqual([]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "unsupported-no-write",
        failureClass: "workspace-boundary",
        writeIntentFiles: [],
        changedFiles: [],
        plannedFiles: [],
        writerInvoked: false,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        successLike: false,
      }),
    );
    expect(writes).toBe(0);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("keeps malformed patches stopped with invalid-model-output per-file projection", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    let writes = 0;

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, "not a patch"),
      getWorkspaceAuthority: () =>
        authorityWithBlockedWriter(fixture.workspaceRoot, () => {
          writes += 1;
        }),
    });

    expect(result?.status).toBe("stopped_error");
    expect(result?.terminalClassification).toBe("stopped");
    expect(result?.codingResult?.changedFiles).toEqual([]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "invalid-model-output",
        failureClass: "parse-failure",
        writerInvoked: false,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        successLike: false,
      }),
    );
    expect(result?.codingResult?.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({
        operationKind: "malformed",
        supportStatus: "invalid-model-output",
        writeIntent: "none",
      }),
    ]);
    expect(writes).toBe(0);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("keeps success-like text with no patch stopped as invalid model output", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    let writes = 0;

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, "Done. I changed src/a.ts successfully."),
      getWorkspaceAuthority: () =>
        authorityWithBlockedWriter(fixture.workspaceRoot, () => {
          writes += 1;
        }),
    });

    expect(result?.status).toBe("stopped_error");
    expect(result?.terminalClassification).toBe("stopped");
    expect(result?.codingResult?.changedFiles).toEqual([]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "invalid-model-output",
        failureClass: "parse-failure",
        writeIntentFiles: [],
        changedFiles: [],
        plannedFiles: [],
        writerInvoked: false,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        successLike: false,
      }),
    );
    expect(writes).toBe(0);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("routes update plus delete through the guarded mixed writer", async () => {
    const fixture = createFixture();

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, mixedPatch()),
      getWorkspaceAuthority: () =>
        createWorkspaceWriteAuthority(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("completed");
    expect(result?.terminalClassification).toBe("success");
    expect(result?.codingResult?.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: ["src/a.ts", "src/b.ts"],
        changedFiles: ["src/a.ts", "src/b.ts"],
        failedFiles: [],
        writerInvoked: true,
        creatorInvoked: false,
        deleteMoveInvoked: true,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(result?.codingResult?.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({ operationKind: "update", writeIntent: "eligible" }),
      expect.objectContaining({ operationKind: "delete", writeIntent: "eligible" }),
    ]);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual({
      "src/a.ts": "a = 2\n",
    });
  });

  it("routes exactly-three mixed operations through the guarded mixed writer", async () => {
    const fixture = createFixture();

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, mixedUpdateCreateDeletePatch()),
      getWorkspaceAuthority: () =>
        createWorkspaceWriteAuthority(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("completed");
    expect(result?.terminalClassification).toBe("success");
    expect(result?.codingResult?.changedFiles).toEqual([
      "src/a.ts",
      "src/new.ts",
      "src/b.ts",
    ]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: ["src/a.ts", "src/new.ts", "src/b.ts"],
        changedFiles: ["src/a.ts", "src/new.ts", "src/b.ts"],
        failedFiles: [],
        writerInvoked: true,
        creatorInvoked: true,
        deleteMoveInvoked: true,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual({
      "src/a.ts": "a = 2\n",
      "src/new.ts": "created",
    });
  });

  it("routes exactly-two delete-only operations through the guarded destructive writer", async () => {
    const fixture = createFixture();

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, twoDeletePatch()),
      getWorkspaceAuthority: () =>
        createWorkspaceWriteAuthority(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("completed");
    expect(result?.terminalClassification).toBe("success");
    expect(result?.codingResult?.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: ["src/a.ts", "src/b.ts"],
        changedFiles: ["src/a.ts", "src/b.ts"],
        failedFiles: [],
        writerInvoked: true,
        creatorInvoked: false,
        deleteMoveInvoked: true,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual({});
  });

  it("routes exactly-two move-only operations through the guarded destructive writer", async () => {
    const fixture = createFixture();

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, twoMovePatch()),
      getWorkspaceAuthority: () =>
        createWorkspaceWriteAuthority(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("completed");
    expect(result?.terminalClassification).toBe("success");
    expect(result?.codingResult?.changedFiles).toEqual([
      "src/moved-a.ts",
      "src/moved-b.ts",
    ]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: ["src/moved-a.ts", "src/moved-b.ts"],
        changedFiles: ["src/moved-a.ts", "src/moved-b.ts"],
        failedFiles: [],
        writerInvoked: true,
        creatorInvoked: false,
        deleteMoveInvoked: true,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(readFile(fixture.workspaceRoot, "src/moved-a.ts")).toBe("a = 1\n");
    expect(readFile(fixture.workspaceRoot, "src/moved-b.ts")).toBe("b = 1\n");
  });

  it("keeps mixed create plus move patches stopped before any writer", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    let writes = 0;

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, mixedCreateMovePatch()),
      getWorkspaceAuthority: () =>
        authorityWithBlockedWriter(fixture.workspaceRoot, () => {
          writes += 1;
        }),
    });

    expect(result?.status).toBe("stopped_error");
    expect(result?.terminalClassification).toBe("stopped");
    expect(result?.codingResult?.changedFiles).toEqual([]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "unsupported-no-write",
        failureClass: "unsupported-operation",
        writeIntentFiles: [],
        changedFiles: [],
        plannedFiles: [],
        writerInvoked: false,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        postWriteVerification: "not-run",
        successLike: false,
      }),
    );
    expect(result?.codingResult?.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({ operationKind: "create", writeIntent: "none" }),
      expect.objectContaining({
        operationKind: "move",
        sourcePath: "src/a.ts",
        targetPath: "src/moved.ts",
        writeIntent: "none",
      }),
    ]);
    expect(writes).toBe(0);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it.each([
    {
      name: "update plus create",
      patchText: mixedUpdateCreatePatch(),
      operationKinds: ["update", "create"],
      targets: ["src/a.ts", "src/new.ts"],
    },
    {
      name: "update plus delete",
      patchText: mixedPatch(),
      operationKinds: ["update", "delete"],
      targets: ["src/a.ts", "src/b.ts"],
    },
    {
      name: "update plus move",
      patchText: mixedUpdateMovePatch(),
      operationKinds: ["update", "move"],
      targets: ["src/a.ts", "src/moved.ts"],
    },
    {
      name: "create plus delete",
      patchText: mixedCreateDeletePatch(),
      operationKinds: ["create", "delete"],
      targets: ["src/new.ts", "src/a.ts"],
    },
    {
      name: "create plus move",
      patchText: mixedPureCreateMovePatch(),
      operationKinds: ["create", "move"],
      targets: ["src/new.ts", "src/moved.ts"],
    },
    {
      name: "delete plus move",
      patchText: mixedDeleteMovePatch(),
      operationKinds: ["delete", "move"],
      targets: ["src/a.ts", "src/moved.ts"],
    },
  ])("routes mixed $name with accurate writer family flags", async ({
    patchText,
    operationKinds,
    targets,
  }) => {
    const fixture = createFixture();

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, patchText),
      getWorkspaceAuthority: () =>
        createWorkspaceWriteAuthority(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("completed");
    expect(result?.terminalClassification).toBe("success");
    expect(result?.codingResult?.changedFiles).toEqual(targets);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: targets,
        changedFiles: targets,
        plannedFiles: [],
        failedFiles: [],
        writerInvoked: true,
        creatorInvoked: operationKinds.includes("create"),
        deleteMoveInvoked:
          operationKinds.includes("delete") || operationKinds.includes("move"),
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(
      result?.codingResult?.perFilePatchPlan?.operations.map(
        (operation) => operation.operationKind,
      ),
    ).toEqual(operationKinds);
  });

  it("keeps outside-workspace delete and move patches stopped without writer reachability", async () => {
    for (const patchText of [outsideDeletePatch(), outsideMoveTargetPatch()]) {
      const fixture = createFixture();
      const before = snapshotFixture(fixture.workspaceRoot);
      let writes = 0;

      const result = await projectApplyPatchRuntimeMutationRoute({
        ...runtimeInput(fixture.workspaceRoot, patchText),
        getWorkspaceAuthority: () =>
          authorityWithBlockedWriter(fixture.workspaceRoot, () => {
            writes += 1;
          }),
      });

      expect(result?.status).toBe("stopped_error");
      expect(result?.terminalClassification).toBe("stopped");
      expect(result?.codingResult?.changedFiles).toEqual([]);
      expect(result?.codingResult?.perFilePatchPlan).toEqual(
        expect.objectContaining({
          supportStatus: "unsupported-no-write",
          failureClass: "workspace-boundary",
          writeIntentFiles: [],
          changedFiles: [],
          plannedFiles: [],
          writerInvoked: false,
          creatorInvoked: false,
          deleteMoveInvoked: false,
          postWriteVerification: "not-run",
          successLike: false,
        }),
      );
      expect(result?.codingResult?.perFilePatchPlan?.failedFiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "../outside.ts",
            reason: "Patch path resolves outside the workspace root.",
          }),
        ]),
      );
      expect(result?.codingResult?.perFilePatchPlan?.operations).toEqual([
        expect.objectContaining({
          failedFile: expect.objectContaining({
            reason: "Patch path resolves outside the workspace root.",
          }),
        }),
      ]);
      expect(writes).toBe(0);
      expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
    }
  });
});

function runtimeInput(workspaceRoot: string, rawPatchText: string) {
  return {
    sessionId: "session-1",
    prompt: rawPatchText,
    workspaceRoot,
    routeOptions: {
      explicitRuntimeOptIn: true,
      rawPatchText,
      requestedUserDecision: "approved" as const,
      workspaceWrite: {
        explicitWorkspaceWriteOptIn: true,
      },
    },
    readNoWriteRuntimeFile: readWorkspaceFile(workspaceRoot),
  };
}

function authorityWithBlockedWriter(
  workspaceRoot: string,
  onWrite: () => void,
): MutationRoutingProjectionAuthority {
  const authority = createWorkspaceWriteAuthority(workspaceRoot);
  return {
    ...authority,
    writeFile: () => {
      onWrite();
      throw new Error("writer must not be invoked");
    },
    createFileExclusive: () => {
      onWrite();
      throw new Error("creator must not be invoked");
    },
    moveFileExclusive: () => {
      onWrite();
      throw new Error("move writer must not be invoked");
    },
    deleteFile: () => {
      onWrite();
      throw new Error("delete writer must not be invoked");
    },
  };
}

function singleFileUpdatePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** End Patch",
  ].join("\n");
}

function fencedSingleFileUpdatePatch(): string {
  return [
    "Here is the patch:",
    "```diff",
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** End Patch",
    "```",
    "The change is complete.",
  ].join("\n");
}

function twoFileUpdatePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Update File: src/b.ts",
    "@@",
    "-b = 1",
    "+b = 2",
    "*** End Patch",
  ].join("\n");
}

function duplicateTargetPatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 2",
    "+a = 3",
    "*** End Patch",
  ].join("\n");
}

function outsideWorkspacePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: ../outside.ts",
    "@@",
    "-outside = 1",
    "+outside = 2",
    "*** End Patch",
  ].join("\n");
}

function threeFileUpdatePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Update File: src/b.ts",
    "@@",
    "-b = 1",
    "+b = 2",
    "*** Update File: src/c.ts",
    "@@",
    "-c = 1",
    "+c = 2",
    "*** End Patch",
  ].join("\n");
}

function fourFileUpdatePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Update File: src/b.ts",
    "@@",
    "-b = 1",
    "+b = 2",
    "*** Update File: src/c.ts",
    "@@",
    "-c = 1",
    "+c = 2",
    "*** Update File: src/d.ts",
    "@@",
    "-d = 1",
    "+d = 2",
    "*** End Patch",
  ].join("\n");
}

function fiveFileUpdatePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Update File: src/b.ts",
    "@@",
    "-b = 1",
    "+b = 2",
    "*** Update File: src/c.ts",
    "@@",
    "-c = 1",
    "+c = 2",
    "*** Update File: src/d.ts",
    "@@",
    "-d = 1",
    "+d = 2",
    "*** Update File: src/e.ts",
    "@@",
    "-e = 1",
    "+e = 2",
    "*** End Patch",
  ].join("\n");
}

function addFilePatch(): string {
  return [
    "*** Begin Patch",
    "*** Add File: src/new.ts",
    "+created",
    "*** End Patch",
  ].join("\n");
}

function deleteFilePatch(): string {
  return [
    "*** Begin Patch",
    "*** Delete File: src/a.ts",
    "*** End Patch",
  ].join("\n");
}

function moveFilePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "*** Move to: src/moved.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** End Patch",
  ].join("\n");
}

function pureMoveFilePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "*** Move to: src/moved.ts",
    "@@",
    " a = 1",
    "*** End Patch",
  ].join("\n");
}

function broadPatch(): string {
  return [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1 +1 @@",
    "-a = 1",
    "+a = 2",
  ].join("\n");
}

function mixedPatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Delete File: src/b.ts",
    "*** End Patch",
  ].join("\n");
}

function mixedUpdateCreatePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Add File: src/new.ts",
    "+created",
    "*** End Patch",
  ].join("\n");
}

function mixedUpdateCreateDeletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Add File: src/new.ts",
    "+created",
    "*** Delete File: src/b.ts",
    "*** End Patch",
  ].join("\n");
}

function mixedUpdateMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Update File: src/b.ts",
    "*** Move to: src/moved.ts",
    "@@",
    " b = 1",
    "*** End Patch",
  ].join("\n");
}

function mixedCreateDeletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Add File: src/new.ts",
    "+created",
    "*** Delete File: src/a.ts",
    "*** End Patch",
  ].join("\n");
}

function mixedCreateMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Add File: src/new.ts",
    "+created",
    "*** Update File: src/a.ts",
    "*** Move to: src/moved.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** End Patch",
  ].join("\n");
}

function mixedPureCreateMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Add File: src/new.ts",
    "+created",
    "*** Update File: src/a.ts",
    "*** Move to: src/moved.ts",
    "@@",
    " a = 1",
    "*** End Patch",
  ].join("\n");
}

function mixedDeleteMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Delete File: src/a.ts",
    "*** Update File: src/b.ts",
    "*** Move to: src/moved.ts",
    "@@",
    " b = 1",
    "*** End Patch",
  ].join("\n");
}

function twoDeletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Delete File: src/a.ts",
    "*** Delete File: src/b.ts",
    "*** End Patch",
  ].join("\n");
}

function twoMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "*** Move to: src/moved-a.ts",
    "@@",
    " a = 1",
    "*** Update File: src/b.ts",
    "*** Move to: src/moved-b.ts",
    "@@",
    " b = 1",
    "*** End Patch",
  ].join("\n");
}

function outsideDeletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Delete File: ../outside.ts",
    "*** End Patch",
  ].join("\n");
}

function outsideMoveTargetPatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "*** Move to: ../outside.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** End Patch",
  ].join("\n");
}

function createFixture(
  options: { readonly includeC?: boolean; readonly includeD?: boolean } = {},
): {
  readonly workspaceRoot: string;
} {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "mutation-routing-projection-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, "src", "a.ts"),
    "a = 1\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(workspaceRoot, "src", "b.ts"),
    "b = 1\n",
    "utf8",
  );
  if (options.includeC) {
    fs.writeFileSync(
      path.join(workspaceRoot, "src", "c.ts"),
      "c = 1\n",
      "utf8",
    );
  }
  if (options.includeD) {
    fs.writeFileSync(
      path.join(workspaceRoot, "src", "d.ts"),
      "d = 1\n",
      "utf8",
    );
  }
  return { workspaceRoot };
}

function readWorkspaceFile(
  workspaceRootInput: string,
): (absolutePath: string) => string | undefined {
  const workspaceRoot = path.resolve(workspaceRootInput);
  return (absolutePath) => {
    const resolved = path.resolve(absolutePath);
    if (!pathStaysInsideWorkspace(workspaceRoot, resolved)) {
      return undefined;
    }
    try {
      return fs.readFileSync(resolved, "utf8");
    } catch {
      return undefined;
    }
  };
}

function readFile(workspaceRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function snapshotFixture(workspaceRoot: string): Record<string, string> {
  const files = [
    "src/a.ts",
    "src/b.ts",
    "src/c.ts",
    "src/d.ts",
    "src/new.ts",
    "src/moved.ts",
    "src/moved-a.ts",
    "src/moved-b.ts",
  ];
  return Object.fromEntries(
    files
      .map((file) => [file, path.join(workspaceRoot, file)] as const)
      .filter(([, absolutePath]) => fs.existsSync(absolutePath))
      .map(([file, absolutePath]) => [
        file,
        fs.readFileSync(absolutePath, "utf8"),
      ]),
  );
}

function pathStaysInsideWorkspace(
  workspaceRoot: string,
  absolutePath: string,
): boolean {
  const relative = path.relative(workspaceRoot, absolutePath);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}
