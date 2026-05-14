import { describe, expect, it } from "vitest";
import {
  applySingleFileDeleteIntent,
  buildSingleFileDeleteApplicationContract,
} from "./singleFileDeleteApply.js";
import type { PatchVerificationResult } from "../patchParsing/types.js";

describe("single-file delete patch application", () => {
  it("builds and applies one delete intent with absent-target verification", async () => {
    const contract = buildSingleFileDeleteApplicationContract(
      verifiedDelete("src/old.ts", "old\n"),
    );
    const files = new Map([["src/old.ts", "old\n"]]);

    const result = await applySingleFileDeleteIntent(contract, {
      deleteFile: (targetPath) => {
        if (!files.delete(targetPath)) {
          throw new Error("invalid delete");
        }
      },
      readFile: (targetPath) => files.get(targetPath),
    });

    expect(contract).toEqual({
      ok: true,
      changedFiles: ["src/old.ts"],
      deleteIntent: {
        targetPath: "src/old.ts",
        content: "old\n",
      },
    });
    expect(result).toEqual({
      ok: true,
      changedFiles: ["src/old.ts"],
      failedFiles: [],
      applied: {
        targetPath: "src/old.ts",
        content: "old\n",
      },
      postWriteVerification: "passed",
    });
  });

  it("rejects non-delete verification plans", () => {
    const contract = buildSingleFileDeleteApplicationContract({
      ok: true,
      plan: {
        parsedPatch: {
          rawText: "",
          operations: [{ kind: "update", path: "src/old.ts", hunks: [] }],
        },
        operations: [
          {
            operation: { kind: "update", path: "src/old.ts", hunks: [] },
            originalContent: "old\n",
            plannedContent: "new\n",
            additions: 1,
            deletions: 1,
          },
        ],
        atomicity: "verify-all-before-write",
      },
      warnings: [],
    });

    expect(contract).toEqual({
      ok: false,
      changedFiles: [],
      failures: [
        expect.objectContaining({
          code: "patch-apply-plan-not-verified",
          path: "src/old.ts",
        }),
      ],
      failureCode: "patch-delete-application-not-verified",
    });
  });

  it("surfaces post-delete verification failure without rollback", async () => {
    const contract = buildSingleFileDeleteApplicationContract(
      verifiedDelete("src/old.ts", "old\n"),
    );
    const files = new Map([["src/old.ts", "old\n"]]);

    const result = await applySingleFileDeleteIntent(contract, {
      deleteFile: () => {
        // Simulates an unlink call that returned but did not remove the target.
      },
      readFile: (targetPath) => files.get(targetPath),
    });

    expect(result).toEqual({
      ok: false,
      changedFiles: [],
      failedFiles: [
        expect.objectContaining({
          code: "patch-apply-write-failed",
          path: "src/old.ts",
        }),
      ],
      applied: {
        targetPath: "src/old.ts",
        content: "old\n",
      },
      failureKind: "post-write-verification",
      postWriteVerification: "failed",
    });
  });
});

function verifiedDelete(
  targetPath: string,
  originalContent: string,
): PatchVerificationResult {
  return {
    ok: true,
    plan: {
      parsedPatch: {
        rawText: "",
        operations: [{ kind: "delete", path: targetPath }],
      },
      operations: [
        {
          operation: { kind: "delete", path: targetPath },
          originalContent,
          plannedContent: "",
          additions: 0,
          deletions: 1,
        },
      ],
      atomicity: "verify-all-before-write",
    },
    warnings: [],
  };
}
