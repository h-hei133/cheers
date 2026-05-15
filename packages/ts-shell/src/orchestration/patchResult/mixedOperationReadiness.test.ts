import { describe, expect, it } from "vitest";
import { projectMixedOperationReadiness } from "./mixedOperationReadiness.js";
import type { PatchFileOperation } from "../patchParsing/types.js";

describe("projectMixedOperationReadiness", () => {
  it("recognizes bounded exactly-four mixed route support without granting write authority", () => {
    const readiness = projectMixedOperationReadiness([
      updateOperation("src/a.ts"),
      addOperation("src/new.ts"),
      deleteOperation("src/old.ts"),
      moveOperation("src/from.ts", "src/to.ts"),
    ]);

    expect(readiness).toEqual({
      isMixedOperation: true,
      operationKinds: ["update", "create", "delete", "move"],
      operationCount: 4,
      individuallySupportedKinds: ["update", "create", "delete", "move"],
      unsupportedIndividualKinds: [],
      blockedCombinations: [],
      routeBlocker: "none",
      additionalPrerequisites: [],
      mixedWritesEnabled: true,
      rollbackOrAtomicityClaim: "none",
      writeAuthority: "not-granted-by-readiness-projection",
    });
  });

  it("recognizes bounded exactly-three mixed route support without granting write authority", () => {
    const readiness = projectMixedOperationReadiness([
      updateOperation("src/a.ts"),
      addOperation("src/new.ts"),
      deleteOperation("src/old.ts"),
    ]);

    expect(readiness).toEqual({
      isMixedOperation: true,
      operationKinds: ["update", "create", "delete"],
      operationCount: 3,
      individuallySupportedKinds: ["update", "create", "delete"],
      unsupportedIndividualKinds: [],
      blockedCombinations: [],
      routeBlocker: "none",
      additionalPrerequisites: [],
      mixedWritesEnabled: true,
      rollbackOrAtomicityClaim: "none",
      writeAuthority: "not-granted-by-readiness-projection",
    });
  });

  it("keeps single-operation families out of the mixed blocker path", () => {
    const readiness = projectMixedOperationReadiness([
      updateOperation("src/a.ts"),
      updateOperation("src/b.ts"),
      updateOperation("src/c.ts"),
    ]);

    expect(readiness).toEqual({
      isMixedOperation: false,
      operationKinds: ["update"],
      operationCount: 3,
      individuallySupportedKinds: ["update"],
      unsupportedIndividualKinds: [],
      blockedCombinations: [],
      routeBlocker: "none",
      additionalPrerequisites: [],
      mixedWritesEnabled: false,
      rollbackOrAtomicityClaim: "none",
      writeAuthority: "not-granted-by-readiness-projection",
    });
  });
});

function updateOperation(path: string): PatchFileOperation {
  return {
    kind: "update",
    path,
    hunks: [],
  };
}

function addOperation(path: string): PatchFileOperation {
  return {
    kind: "add",
    path,
    content: "",
  };
}

function deleteOperation(path: string): PatchFileOperation {
  return {
    kind: "delete",
    path,
  };
}

function moveOperation(path: string, moveTo: string): PatchFileOperation {
  return {
    kind: "move",
    path,
    moveTo,
    hunks: [],
  };
}
