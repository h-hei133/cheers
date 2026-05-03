import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type { ParsedPatch } from "../patchParsing/types.js";
import { verifyParsedPatch } from "../patchVerification/verify.js";
import {
  buildNoPartialPatchApplicationContract,
  type NoPartialPatchApplicationContract,
} from "./noPartialApply.js";
import { applySingleFileUpdateIntent } from "./singleFileUpdateApply.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("applySingleFileUpdateIntent", () => {
  it("applies exactly one verified update intent through the injected writer", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const contract = buildContract([
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "@@",
      "-old",
      "+new",
      "*** End Patch",
    ]);

    const result = await applySingleFileUpdateIntent(contract, {
      writeFile: (targetPath, content) => {
        writes.push({ path: targetPath, content });
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changedFiles).toEqual(["src/app.ts"]);
      expect(result.failedFiles).toEqual([]);
      expect(result.applied).toEqual([
        {
          path: "src/app.ts",
          kind: "update",
          content: "new\n",
        },
      ]);
    }
    expect(writes).toEqual([{ path: "src/app.ts", content: "new\n" }]);
  });

  it("does not call the writer for a failed no-partial contract", async () => {
    let writeCount = 0;
    const contract = buildNoPartialPatchApplicationContract(
      verifyParsedPatch(
        parsePatch([
          "*** Begin Patch",
          "*** Update File: src/missing.ts",
          "@@",
          "-missing",
          "+new",
          "*** End Patch",
        ]),
        {
          workspaceRoot,
          readFile: () => undefined,
        },
      ),
    );

    const result = await applySingleFileUpdateIntent(contract, {
      writeFile: () => {
        writeCount += 1;
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.changedFiles).toEqual([]);
      expect(result.failedFiles[0]?.code).toBe("patch-verify-file-missing");
    }
    expect(writeCount).toBe(0);
  });

  it("rejects multiple write intents without calling the writer", async () => {
    let writeCount = 0;
    const contract: NoPartialPatchApplicationContract = {
      ok: true,
      changedFiles: ["src/a.ts", "src/b.ts"],
      writeIntents: [
        { path: "src/a.ts", kind: "update", content: "a\n" },
        { path: "src/b.ts", kind: "update", content: "b\n" },
      ],
      atomicity: "verify-all-before-write",
    };

    const result = await applySingleFileUpdateIntent(contract, {
      writeFile: () => {
        writeCount += 1;
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.changedFiles).toEqual([]);
      expect(result.failedFiles[0]?.code).toBe(
        "patch-apply-plan-not-verified",
      );
    }
    expect(writeCount).toBe(0);
  });

  it("rejects non-update write intents without calling the writer", async () => {
    let writeCount = 0;
    const contract: NoPartialPatchApplicationContract = {
      ok: true,
      changedFiles: ["src/new.ts"],
      writeIntents: [{ path: "src/new.ts", kind: "add", content: "new\n" }],
      atomicity: "verify-all-before-write",
    };

    const result = await applySingleFileUpdateIntent(contract, {
      writeFile: () => {
        writeCount += 1;
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.changedFiles).toEqual([]);
      expect(result.failedFiles[0]?.code).toBe(
        "patch-apply-plan-not-verified",
      );
      expect(result.failedFiles[0]?.path).toBe("src/new.ts");
    }
    expect(writeCount).toBe(0);
  });

  it("reports writer failure without claiming changed files", async () => {
    const contract = buildContract([
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "@@",
      "-old",
      "+new",
      "*** End Patch",
    ]);

    const result = await applySingleFileUpdateIntent(contract, {
      writeFile: () => {
        throw new Error("disk denied");
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.changedFiles).toEqual([]);
      expect(result.failedFiles).toEqual([
        expect.objectContaining({
          code: "patch-apply-write-failed",
          path: "src/app.ts",
        }),
      ]);
    }
  });
});

function buildContract(
  lines: readonly string[],
): NoPartialPatchApplicationContract {
  return buildNoPartialPatchApplicationContract(
    verifyParsedPatch(parsePatch(lines), {
      workspaceRoot,
      readFile: () => "old\n",
    }),
  );
}

function parsePatch(lines: readonly string[]): ParsedPatch {
  const parsed = parseApplyPatchText(lines.join("\n"));
  if (!parsed.ok) {
    throw new Error(parsed.failure.message);
  }
  return parsed.patch;
}
