import { describe, expect, it } from "vitest";

import {
  extractSecondaryFileWrites,
  extractReplaceDirective,
  resolveMutationInstruction,
} from "./instructionPlanner.js";

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

  it("extracts update-with-content secondary writes for sequenced edits", () => {
    expect(
      extractSecondaryFileWrites(
        "Edit src/feature.ts with content: export const enabled = true. Then update src/feature.test.ts with content: expect(feature()).toBe(true). Verify after edit.",
        "src/feature.ts",
      ),
    ).toEqual([
      {
        path: "src/feature.test.ts",
        content: "expect(feature()).toBe(true)",
      },
    ]);
  });
});
