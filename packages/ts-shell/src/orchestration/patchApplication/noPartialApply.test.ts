import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type { ParsedPatch } from "../patchParsing/types.js";
import { verifyParsedPatch } from "../patchVerification/verify.js";
import { buildNoPartialPatchApplicationContract } from "./noPartialApply.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("buildNoPartialPatchApplicationContract", () => {
  it("produces write intents only after all verification succeeds", () => {
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

    const contract = buildNoPartialPatchApplicationContract(verification);

    expect(contract.ok).toBe(true);
    if (contract.ok) {
      expect(contract.atomicity).toBe("verify-all-before-write");
      expect(contract.changedFiles).toEqual(["src/app.ts"]);
      expect(contract.writeIntents).toEqual([
        {
          path: "src/app.ts",
          kind: "update",
          content: "new\n",
        },
      ]);
    }
  });

  it("blocks all write intents when verification fails after a previous operation verified", () => {
    const verification = verifyParsedPatch(
      parsePatch([
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
      ]),
      {
        workspaceRoot,
        readFile: (absolutePath) =>
          absolutePath.endsWith(`${path.sep}ok.ts`) ? "old\n" : undefined,
      },
    );

    const contract = buildNoPartialPatchApplicationContract(verification);

    expect(contract.ok).toBe(false);
    if (!contract.ok) {
      expect(contract.failureCode).toBe("patch-no-partial-apply-blocked");
      expect(contract.changedFiles).toEqual([]);
      expect(contract.writeIntents).toEqual([]);
      expect(contract.failures[0]?.code).toBe("patch-verify-file-missing");
    }
  });

  it("keeps unsupported operations as no-write blocked contracts", () => {
    const verification = verifyParsedPatch(
      parsePatch([
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+new",
        "*** End Patch",
      ]),
      {
        workspaceRoot,
        readFile: () => undefined,
      },
    );

    const contract = buildNoPartialPatchApplicationContract(verification);

    expect(contract.ok).toBe(false);
    if (!contract.ok) {
      expect(contract.changedFiles).toEqual([]);
      expect(contract.writeIntents).toEqual([]);
      expect(contract.failures[0]?.code).toBe("patch-add-file-not-enabled");
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
