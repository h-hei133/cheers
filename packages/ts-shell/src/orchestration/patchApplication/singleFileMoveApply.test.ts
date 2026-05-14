import { describe, expect, it } from "vitest";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import { verifyParsedPatch } from "../patchVerification/verify.js";
import {
  applySingleFileMoveIntent,
  buildSingleFileMoveApplicationContract,
} from "./singleFileMoveApply.js";

describe("single-file move patch application", () => {
  it("builds and applies one pure move intent with content-preserving verification", async () => {
    const files = new Map<string, string>([["src/from.ts", "from\n"]]);
    const contract = buildSingleFileMoveApplicationContract(
      verifyMovePatch(pureMovePatch(), files),
    );

    expect(contract).toEqual(
      expect.objectContaining({
        ok: true,
        changedFiles: ["src/to.ts"],
        moveIntent: {
          sourcePath: "src/from.ts",
          targetPath: "src/to.ts",
          content: "from\n",
        },
      }),
    );

    const result = await applySingleFileMoveIntent(contract, {
      moveFileExclusive: (sourcePath, targetPath) => {
        const content = files.get(sourcePath);
        if (content === undefined || files.has(targetPath)) {
          throw new Error("invalid move");
        }
        files.set(targetPath, content);
        files.delete(sourcePath);
      },
      readFile: (file) => files.get(file),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        changedFiles: ["src/to.ts"],
        failedFiles: [],
        postWriteVerification: "passed",
      }),
    );
    expect(files.get("src/from.ts")).toBeUndefined();
    expect(files.get("src/to.ts")).toBe("from\n");
  });

  it("rejects move patches that also change content", () => {
    const files = new Map<string, string>([["src/from.ts", "from\n"]]);
    const contract = buildSingleFileMoveApplicationContract(
      verifyMovePatch(contentChangingMovePatch(), files),
    );

    expect(contract).toEqual(
      expect.objectContaining({
        ok: false,
        changedFiles: [],
        failures: [
          expect.objectContaining({
            path: "src/to.ts",
            message:
              "Move File in this guarded lane must preserve file content exactly; content edits during move are not enabled.",
          }),
        ],
      }),
    );
  });

  it("surfaces post-write verification failure with changed target facts", async () => {
    const files = new Map<string, string>([["src/from.ts", "from\n"]]);
    const contract = buildSingleFileMoveApplicationContract(
      verifyMovePatch(pureMovePatch(), files),
    );

    const result = await applySingleFileMoveIntent(contract, {
      moveFileExclusive: (sourcePath, targetPath) => {
        files.set(targetPath, files.get(sourcePath) ?? "");
      },
      readFile: (file) => files.get(file),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        changedFiles: ["src/to.ts"],
        failedFiles: [expect.objectContaining({ path: "src/to.ts" })],
        failureKind: "post-write-verification",
        postWriteVerification: "failed",
      }),
    );
  });
});

function verifyMovePatch(rawPatchText: string, files: Map<string, string>) {
  const parsed = parseApplyPatchText(rawPatchText);
  if (parsed.ok === false) {
    throw new Error(parsed.failure.message);
  }
  return verifyParsedPatch(parsed.patch, {
    workspaceRoot: "/workspace",
    readFile: (absolutePath) => {
      const relativePath = absolutePath.replace(/^\/workspace\//, "");
      return files.get(relativePath);
    },
    supportedOperations: ["move"],
  });
}

function pureMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/from.ts",
    "*** Move to: src/to.ts",
    "@@",
    " from",
    "*** End Patch",
  ].join("\n");
}

function contentChangingMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/from.ts",
    "*** Move to: src/to.ts",
    "@@",
    "-from",
    "+to",
    "*** End Patch",
  ].join("\n");
}
