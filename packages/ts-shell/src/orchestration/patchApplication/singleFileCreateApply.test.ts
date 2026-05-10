import { describe, expect, it } from "vitest";
import { applySingleFileCreateIntent } from "./singleFileCreateApply.js";
import type { NoPartialPatchApplicationContract } from "./noPartialApply.js";

const createContract: NoPartialPatchApplicationContract = {
  ok: true,
  changedFiles: ["src/new.ts"],
  writeIntents: [
    {
      path: "src/new.ts",
      kind: "add",
      content: "export const status = 'ready';\n",
    },
  ],
  atomicity: "verify-all-before-write",
};

describe("single-file Add File create apply", () => {
  it("reports a changed file only after exclusive create and readback verification", async () => {
    const files = new Map<string, string>();

    const result = await applySingleFileCreateIntent(createContract, {
      createFileExclusive: (file, content) => {
        if (files.has(file)) {
          throw new Error("target exists");
        }
        files.set(file, content);
      },
      readFile: (file) => files.get(file),
    });

    expect(result.ok).toBe(true);
    expect(result.changedFiles).toEqual(["src/new.ts"]);
    expect(result.failedFiles).toEqual([]);
    expect(result.postWriteVerification).toBe("passed");
  });

  it("blocks collisions without changed files", async () => {
    const result = await applySingleFileCreateIntent(createContract, {
      createFileExclusive: () => {
        throw new Error("target exists");
      },
      readFile: () => undefined,
    });

    expect(result.ok).toBe(false);
    expect(result.changedFiles).toEqual([]);
    expect(result.failedFiles[0]).toEqual(
      expect.objectContaining({
        code: "patch-apply-write-failed",
        path: "src/new.ts",
      }),
    );
    expect(result.postWriteVerification).toBe("blocked");
  });

  it("does not report changed files when post-write readback differs", async () => {
    const result = await applySingleFileCreateIntent(createContract, {
      createFileExclusive: () => {},
      readFile: () => "different\n",
    });

    expect(result.ok).toBe(false);
    expect(result.changedFiles).toEqual([]);
    expect(result.failedFiles[0]).toEqual(
      expect.objectContaining({
        code: "patch-apply-write-failed",
        path: "src/new.ts",
      }),
    );
    expect(result.postWriteVerification).toBe("failed");
  });

  it("rejects non-add intents", async () => {
    const result = await applySingleFileCreateIntent(
      {
        ok: true,
        changedFiles: ["src/app.ts"],
        writeIntents: [
          {
            path: "src/app.ts",
            kind: "update",
            content: "updated\n",
          },
        ],
        atomicity: "verify-all-before-write",
      },
      {
        createFileExclusive: () => {
          throw new Error("writer must stay unreachable");
        },
        readFile: () => undefined,
      },
    );

    expect(result.ok).toBe(false);
    expect(result.changedFiles).toEqual([]);
    expect(result.failedFiles[0]?.code).toBe("patch-apply-plan-not-verified");
  });
});
