import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type { ParsedPatch } from "../patchParsing/types.js";
import { verifyParsedPatch } from "../patchVerification/verify.js";
import { buildPatchPreview } from "./preview.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("buildPatchPreview", () => {
  it("builds a no-write preview for verified update plans", () => {
    const verification = verifyParsedPatch(
      parsePatch([
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ]),
      {
        workspaceRoot,
        readFile: () => "old\n",
      },
    );

    const preview = buildPatchPreview(verification);

    expect(preview.willWrite).toBe(false);
    expect(preview.changedFiles).toEqual(["src/app.ts"]);
    expect(preview.failedFiles).toEqual([]);
    expect(preview.files).toEqual([
      {
        path: "src/app.ts",
        kind: "update",
        additions: 1,
        deletions: 1,
        summary: "M src/app.ts",
      },
    ]);
  });

  it("summarizes add, delete, and move operation plans when explicitly supported", () => {
    const verification = verifyParsedPatch(
      parsePatch([
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+new",
        "*** Delete File: src/delete.ts",
        "*** Update File: src/from.ts",
        "*** Move to: src/to.ts",
        "@@",
        "-from",
        "+to",
        "*** End Patch",
      ]),
      {
        workspaceRoot,
        supportedOperations: ["add", "delete", "move"],
        readFile: (absolutePath) => {
          if (absolutePath.endsWith(`${path.sep}delete.ts`)) {
            return "delete\n";
          }
          if (absolutePath.endsWith(`${path.sep}from.ts`)) {
            return "from\n";
          }
          return undefined;
        },
      },
    );

    const preview = buildPatchPreview(verification);

    expect(preview.willWrite).toBe(false);
    expect(preview.failedFiles).toEqual([]);
    expect(preview.changedFiles).toEqual([
      "src/new.ts",
      "src/delete.ts",
      "src/to.ts",
    ]);
    expect(preview.files.map((file) => file.summary)).toEqual([
      "A src/new.ts",
      "D src/delete.ts",
      "R src/to.ts",
    ]);
  });

  it("keeps failed verification previews as no-write failed files", () => {
    const verification = verifyParsedPatch(
      parsePatch([
        "*** Begin Patch",
        "*** Update File: src/missing.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ]),
      {
        workspaceRoot,
        readFile: () => undefined,
      },
    );

    const preview = buildPatchPreview(verification);

    expect(preview.willWrite).toBe(false);
    expect(preview.changedFiles).toEqual([]);
    expect(preview.files).toEqual([]);
    expect(preview.failedFiles[0]?.code).toBe("patch-verify-file-missing");
    expect(preview.failedFiles[0]?.path).toBe("src/missing.ts");
  });
});

function parsePatch(lines: readonly string[]): ParsedPatch {
  const parsed = parseApplyPatchText(lines.join("\n"));
  if (!parsed.ok) {
    throw new Error(parsed.failure.message);
  }
  return parsed.patch;
}
