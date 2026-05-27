import { describe, expect, it } from "vitest";

import {
  extractReplaceDirective,
  resolveMutationInstruction,
} from "./mutationInstructionPlanner.js";

describe("mutationInstructionPlanner", () => {
  it("plans concrete write content without claiming verification", () => {
    const instruction = resolveMutationInstruction(
      { taskKind: "write-file", targetPath: "notes.txt" } as never,
      "create notes.txt with content: hello",
      undefined,
      undefined,
      undefined,
    );

    expect(instruction).toMatchObject({
      ok: true,
      content: "hello",
      addedLines: 1,
    });
  });

  it("preserves patch failure wording for missing replace source", () => {
    const directive = extractReplaceDirective("replace old with new");
    const instruction = resolveMutationInstruction(
      { taskKind: "edit-file", targetPath: "app.js", replaceFrom: "old", replaceTo: "new" } as never,
      "replace old with new",
      "const value = 1;",
      undefined,
      directive,
    );

    expect(instruction.ok).toBe(false);
    if (!instruction.ok) {
      expect(instruction.reason).toContain("patch-from-not-found");
    }
  });
});
