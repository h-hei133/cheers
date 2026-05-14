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

  it("projects exactly three Update File patches as stopped planning/no-write before authority construction", async () => {
    const fixture = createFixture({ includeC: true });
    const before = snapshotFixture(fixture.workspaceRoot);
    let authorityRequested = false;

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, threeFileUpdatePatch()),
      getWorkspaceAuthority: () => {
        authorityRequested = true;
        throw new Error("workspace authority must not be requested");
      },
    });

    expect(result?.status).toBe("stopped_error");
    expect(result?.terminalClassification).toBe("stopped");
    expect(result?.codingResult?.changedFiles).toEqual([]);
    expect(result?.codingResult?.changeSet.attemptedFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-planning-no-write",
        failureClass: "none",
        writeIntentFiles: [],
        changedFiles: [],
        plannedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
        failedFiles: [],
        writerInvoked: false,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        postWriteVerification: "not-run",
        successLike: false,
      }),
    );
    expect(result?.finalOutput).toContain(
      "apply_patch exactly-three update planning stopped before write",
    );
    expect(result?.finalOutput).toContain("Writer: not invoked");
    expect(authorityRequested).toBe(false);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("keeps 4+ Update File patches stopped before writer invocation", async () => {
    const fixture = createFixture({ includeC: true, includeD: true });
    const before = snapshotFixture(fixture.workspaceRoot);
    let writes = 0;

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, fourFileUpdatePatch()),
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

  it("keeps Delete File patches stopped before writer invocation", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    let writes = 0;

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, deleteFilePatch()),
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
      expect.objectContaining({
        operationKind: "delete",
        supportStatus: "unsupported-no-write",
        targetPath: "src/a.ts",
        writeIntent: "none",
      }),
    ]);
    expect(writes).toBe(0);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
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

  it("keeps mixed supported/unsupported patches stopped with unsupported/no-write per-file projection", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    let writes = 0;

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, mixedPatch()),
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
        failureClass: "mixed-operations",
        writeIntentFiles: [],
        writerInvoked: false,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        successLike: false,
      }),
    );
    expect(result?.codingResult?.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({ operationKind: "update", writeIntent: "none" }),
      expect.objectContaining({ operationKind: "delete", writeIntent: "none" }),
    ]);
    expect(writes).toBe(0);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
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
  const files = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/new.ts"];
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
