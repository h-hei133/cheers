import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type { ParsedPatch } from "../patchParsing/types.js";
import { verifyParsedPatch } from "./verify.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("verifyParsedPatch", () => {
  it("verifies single-file update hunks without writing files", () => {
    const patch = parsePatch([
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "@@",
      " const value = 1;",
      "-return value;",
      "+return value + 1;",
      "*** End Patch",
    ]);
    const writes: string[] = [];

    const result = verifyParsedPatch(patch, {
      workspaceRoot,
      readFile: (absolutePath) => {
        expect(absolutePath).toBe(path.resolve(workspaceRoot, "src/app.ts"));
        writes.push("read");
        return "const value = 1;\nreturn value;\n";
      },
    });

    expect(result.ok).toBe(true);
    expect(writes).toEqual(["read"]);
    if (result.ok) {
      expect(result.plan.atomicity).toBe("verify-all-before-write");
      expect(result.plan.operations[0]?.plannedContent).toBe(
        "const value = 1;\nreturn value + 1;\n",
      );
      expect(result.plan.operations[0]?.additions).toBe(1);
      expect(result.plan.operations[0]?.deletions).toBe(1);
    }
  });

  it("rejects unsupported operations by default before verification", () => {
    const patch = parsePatch([
      "*** Begin Patch",
      "*** Add File: src/new.ts",
      "+export const value = 1;",
      "*** End Patch",
    ]);

    const result = verifyParsedPatch(patch, {
      workspaceRoot,
      readFile: () => undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.changedFiles).toEqual([]);
      expect(result.failures[0]?.code).toBe("patch-add-file-not-enabled");
    }
  });

  it("detects paths outside the workspace", () => {
    const patch = parsePatch([
      "*** Begin Patch",
      "*** Update File: ../outside.ts",
      "@@",
      "-old",
      "+new",
      "*** End Patch",
    ]);

    const result = verifyParsedPatch(patch, {
      workspaceRoot,
      readFile: () => "old\n",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.changedFiles).toEqual([]);
      expect(result.failures[0]?.code).toBe(
        "patch-verify-path-outside-workspace",
      );
    }
  });

  it("detects missing update targets", () => {
    const patch = parsePatch([
      "*** Begin Patch",
      "*** Update File: src/missing.ts",
      "@@",
      "-old",
      "+new",
      "*** End Patch",
    ]);

    const result = verifyParsedPatch(patch, {
      workspaceRoot,
      readFile: () => undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures[0]?.code).toBe("patch-verify-file-missing");
      expect(result.changedFiles).toEqual([]);
    }
  });

  it("detects missing hunk context", () => {
    const patch = parsePatch([
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "@@",
      "-old",
      "+new",
      "*** End Patch",
    ]);

    const result = verifyParsedPatch(patch, {
      workspaceRoot,
      readFile: () => "current\n",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures[0]?.code).toBe(
        "patch-verify-hunk-context-missing",
      );
      expect(result.changedFiles).toEqual([]);
    }
  });

  it("detects ambiguous hunk context and blocks all changes", () => {
    const patch = parsePatch([
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "@@",
      "-same",
      "+changed",
      "*** End Patch",
    ]);

    const result = verifyParsedPatch(patch, {
      workspaceRoot,
      readFile: () => "same\nsame\n",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.changedFiles).toEqual([]);
      expect(result.failures[0]?.code).toBe(
        "patch-verify-hunk-context-ambiguous",
      );
    }
  });

  it("blocks the whole patch when any operation fails verification", () => {
    const patch = parsePatch([
      "*** Begin Patch",
      "*** Update File: src/ok.ts",
      "@@",
      "-old",
      "+new",
      "*** Update File: src/missing.ts",
      "@@",
      "-missing",
      "+new",
      "*** End Patch",
    ]);

    const result = verifyParsedPatch(patch, {
      workspaceRoot,
      readFile: (absolutePath) =>
        absolutePath.endsWith(`${path.sep}ok.ts`) ? "old\n" : undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.changedFiles).toEqual([]);
      expect(result.failures.map((failure) => failure.code)).toEqual([
        "patch-verify-file-missing",
      ]);
    }
  });
});

function parsePatch(lines: readonly string[]): ParsedPatch {
  const parsed = parseApplyPatchText(lines.join("\n"));
  if (!parsed.ok) {
    throw new Error(parsed.failure.message);
  }
  return parsed.patch;
}
