import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildNoPartialPatchApplicationContract } from "../patchApplication/noPartialApply.js";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type {
  ParsedPatch,
  PatchVerificationResult,
} from "../patchParsing/types.js";
import { verifyParsedPatch } from "../patchVerification/verify.js";
import { buildPatchPreview } from "./preview.js";
import { buildSingleFileUpdatePatchReadinessContract } from "./readiness.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("buildSingleFileUpdatePatchReadinessContract", () => {
  it("expresses the preview-to-production contract for a single Update File patch", () => {
    const verification = verifyPatch(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        " const value = 1;",
        "-return value;",
        '+return value + 1;',
        "*** End Patch",
      ],
      {
        "src/app.ts": "const value = 1;\nreturn value;\n",
      },
    );
    const preview = buildPatchPreview(verification);
    const noPartial = buildNoPartialPatchApplicationContract(verification);

    const readiness = buildSingleFileUpdatePatchReadinessContract({
      verification,
      preview,
      applicationContract: noPartial,
    });

    expect(preview.willWrite).toBe(false);
    expect(readiness.ready).toBe(true);
    expect(readiness.permissionMetadata).toEqual({
      capability: "single-file-update-apply-patch-readiness",
      operationKind: "update",
      targetPath: "src/app.ts",
      previewSummary: ["M src/app.ts"],
      additions: 1,
      deletions: 1,
      singleFileOnly: true,
      unsupportedOperations: ["multi-file", "add", "delete", "move"],
      willWrite: false,
    });
    expect(readiness.result).toEqual({
      status: "ready",
      changedFiles: ["src/app.ts"],
      failedFiles: [],
      patches: [
        {
          path: "src/app.ts",
          operation: "update",
          status: "previewed",
          additions: 1,
          deletions: 1,
        },
      ],
      evidence: expect.arrayContaining([
        "apply-patch-readiness:single-file-update",
        "apply-patch-readiness:preview-only",
        "apply-patch-readiness:verify-all-before-write",
        "apply-patch-readiness:no-production-wiring",
      ]),
      nextAction: expect.stringContaining("production apply_patch rejected"),
    });
    expect(readiness.noPartial).toEqual({
      atomicity: "verify-all-before-write",
      writeIntents: 1,
      blockedWrites: false,
    });
  });

  it.each([
    {
      name: "missing file",
      lines: [
        "*** Begin Patch",
        "*** Update File: src/missing.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      files: {},
      expectedCode: "patch-verify-file-missing",
      expectedPath: "src/missing.ts",
    },
    {
      name: "ambiguous hunk",
      lines: [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-same",
        "+changed",
        "*** End Patch",
      ],
      files: {
        "src/app.ts": "same\nsame\n",
      },
      expectedCode: "patch-verify-hunk-context-ambiguous",
      expectedPath: "src/app.ts",
    },
    {
      name: "unsupported add",
      lines: [
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+new",
        "*** End Patch",
      ],
      files: {},
      expectedCode: "patch-add-file-not-enabled",
      expectedPath: "src/new.ts",
    },
    {
      name: "unsupported delete",
      lines: [
        "*** Begin Patch",
        "*** Delete File: src/remove.ts",
        "*** End Patch",
      ],
      files: {
        "src/remove.ts": "remove\n",
      },
      expectedCode: "patch-verify-operation-unsupported",
      expectedPath: "src/remove.ts",
    },
    {
      name: "unsupported move",
      lines: [
        "*** Begin Patch",
        "*** Update File: src/from.ts",
        "*** Move to: src/to.ts",
        "@@",
        "-from",
        "+to",
        "*** End Patch",
      ],
      files: {
        "src/from.ts": "from\n",
      },
      expectedCode: "patch-verify-operation-unsupported",
      expectedPath: "src/from.ts",
    },
    {
      name: "multi-file patch",
      lines: [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: src/b.ts",
        "@@",
        "-b",
        "+bb",
        "*** End Patch",
      ],
      files: {
        "src/a.ts": "a\n",
        "src/b.ts": "b\n",
      },
      expectedCode: "patch-apply-plan-not-verified",
      expectedPath: undefined,
    },
  ])(
    "keeps $name readiness failures no-write and production-unwired",
    ({ lines, files, expectedCode, expectedPath }) => {
      const verification = verifyPatch(lines, files);
      const preview = buildPatchPreview(verification);
      const noPartial = buildNoPartialPatchApplicationContract(verification);

      const readiness = buildSingleFileUpdatePatchReadinessContract({
        verification,
        preview,
        applicationContract: noPartial,
      });

      expect(preview.willWrite).toBe(false);
      expect(readiness.ready).toBe(false);
      expect(readiness.permissionMetadata.willWrite).toBe(false);
      expect(readiness.permissionMetadata.singleFileOnly).toBe(true);
      expect(readiness.permissionMetadata.unsupportedOperations).toEqual([
        "multi-file",
        "add",
        "delete",
        "move",
      ]);
      expect(readiness.result.status).toBe("blocked");
      expect(readiness.result.changedFiles).toEqual([]);
      expect(readiness.result.failedFiles).toEqual([
        expect.objectContaining({
          code: expectedCode,
          ...(expectedPath ? { path: expectedPath } : {}),
        }),
      ]);
      expect(readiness.result.patches[0]).toEqual(
        expect.objectContaining({
          operation: "update",
          status: "blocked",
          failureCode: expectedCode,
        }),
      );
      expect(readiness.result.evidence).toEqual(
        expect.arrayContaining([
          "apply-patch-readiness:blocked",
          "apply-patch-readiness:no-production-wiring",
          "apply-patch-readiness:no-write-intents",
        ]),
      );
      expect(readiness.result.nextAction).toEqual(expect.any(String));
      expect(readiness.noPartial).toEqual({
        atomicity: "verify-all-before-write",
        writeIntents: 0,
        blockedWrites: true,
      });
    },
  );

  it("classifies Add File collision without write intents", () => {
    const verification = verifyPatch(
      [
        "*** Begin Patch",
        "*** Add File: src/app.ts",
        "+new",
        "*** End Patch",
      ],
      {
        "src/app.ts": "existing\n",
      },
    );
    const preview = buildPatchPreview(verification);
    const noPartial = buildNoPartialPatchApplicationContract(verification);

    const readiness = buildSingleFileUpdatePatchReadinessContract({
      verification,
      preview,
      applicationContract: noPartial,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.result.changedFiles).toEqual([]);
    expect(readiness.result.failedFiles).toEqual([
      expect.objectContaining({
        code: "patch-add-file-target-exists",
        path: "src/app.ts",
      }),
    ]);
    expect(readiness.noPartial).toEqual({
      atomicity: "verify-all-before-write",
      writeIntents: 0,
      blockedWrites: true,
    });
  });
});

function verifyPatch(
  lines: readonly string[],
  files: Readonly<Record<string, string>>,
): PatchVerificationResult {
  return verifyParsedPatch(parsePatch(lines), {
    workspaceRoot,
    readFile: (absolutePath) => {
      const relativePath = path.relative(workspaceRoot, absolutePath);
      return files[relativePath];
    },
  });
}

function parsePatch(lines: readonly string[]): ParsedPatch {
  const parsed = parseApplyPatchText(lines.join("\n"));
  if (!parsed.ok) {
    throw new Error(parsed.failure.message);
  }
  return parsed.patch;
}
