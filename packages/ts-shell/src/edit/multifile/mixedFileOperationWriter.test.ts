import { describe, expect, it } from "vitest";

import { writeMixedFileOperations } from "./mixedFileOperationWriter.js";
import type { VerifiedPatchFileOperation } from "../../orchestration/patchParsing/types.js";

describe("mixed file operation writer", () => {
  it("writes parsed operations in order and verifies each write", async () => {
    const files = new Map<string, string | undefined>([
      ["src/a.ts", "old\n"],
      ["src/b.ts", "move me\n"],
    ]);
    const written: string[] = [];

    const result = await writeMixedFileOperations(
      {
        readVerifiedFile: (relativePath) => files.get(relativePath),
        writeFile: (relativePath, content) => {
          files.set(relativePath, content);
          written.push(relativePath);
        },
        createFileExclusive: (relativePath, content) => {
          if (files.get(relativePath) !== undefined) {
            throw new Error("target exists");
          }
          files.set(relativePath, content);
          written.push(relativePath);
        },
        moveFileExclusive: (sourcePath, targetPath) => {
          const content = files.get(sourcePath);
          if (content === undefined || files.get(targetPath) !== undefined) {
            throw new Error("move precondition failed");
          }
          files.set(sourcePath, undefined);
          files.set(targetPath, content);
          written.push(targetPath);
        },
        deleteFile: (relativePath) => {
          files.set(relativePath, undefined);
          written.push(relativePath);
        },
      },
      [
        verifiedUpdate("src/a.ts", "new\n"),
        verifiedMove("src/b.ts", "src/c.ts", "move me\n"),
      ],
    );

    expect(result).toMatchObject({
      ok: true,
      changedFiles: ["src/a.ts", "src/c.ts"],
      failedFiles: [],
      postWriteVerification: "passed",
    });
    expect(written).toEqual(["src/a.ts", "src/c.ts"]);
  });

  it("does not turn post-write verification failure into success", async () => {
    const result = await writeMixedFileOperations(
      {
        readVerifiedFile: () => "stale\n",
        writeFile: () => {},
        createFileExclusive: () => {},
        moveFileExclusive: () => {},
        deleteFile: () => {},
      },
      [verifiedUpdate("src/a.ts", "new\n")],
    );

    expect(result).toMatchObject({
      ok: false,
      changedFiles: [],
      postWriteVerification: "failed",
    });
    expect(result.failedFiles[0]).toMatchObject({
      code: "patch-apply-write-failed",
      path: "src/a.ts",
      message: "Patch mixed update post-write verification failed.",
    });
  });
});

function verifiedUpdate(
  path: string,
  plannedContent: string,
): VerifiedPatchFileOperation {
  return {
    operation: { kind: "update", path, hunks: [] },
    originalContent: "old\n",
    plannedContent,
    additions: 1,
    deletions: 1,
  };
}

function verifiedMove(
  path: string,
  moveTo: string,
  originalContent: string,
): VerifiedPatchFileOperation {
  return {
    operation: { kind: "move", path, moveTo, hunks: [] },
    originalContent,
    plannedContent: originalContent,
    additions: 0,
    deletions: 0,
  };
}
