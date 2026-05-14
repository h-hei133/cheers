import { describe, expect, it } from "vitest";
import type { NoPartialPatchApplicationContract } from "./noPartialApply.js";
import { applyMultiFileUpdateIntents } from "./multiFileUpdateApply.js";

const updateContract: NoPartialPatchApplicationContract = {
  ok: true,
  changedFiles: ["src/a.ts", "src/b.ts"],
  writeIntents: [
    {
      path: "src/a.ts",
      kind: "update",
      content: "export const a = 'ready';\n",
    },
    {
      path: "src/b.ts",
      kind: "update",
      content: "export const b = 'ready';\n",
    },
  ],
  atomicity: "verify-all-before-write",
};

describe("multi-file Update File apply", () => {
  it("reports both changed files only after sequential writes and readback verification", async () => {
    const files = new Map<string, string>();

    const result = await applyMultiFileUpdateIntents(updateContract, {
      expectedFileCount: 2,
      writeFile: (file, content) => files.set(file, content),
      readFile: (file) => files.get(file),
    });

    expect(result.ok).toBe(true);
    expect(result.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.failedFiles).toEqual([]);
    expect(result.postWriteVerification).toBe("passed");
  });

  it("reports three changed files only after sequential writes and readback verification", async () => {
    const files = new Map<string, string>();

    const result = await applyMultiFileUpdateIntents(
      {
        ok: true,
        changedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
        writeIntents: [
          {
            path: "src/a.ts",
            kind: "update",
            content: "export const a = 'ready';\n",
          },
          {
            path: "src/b.ts",
            kind: "update",
            content: "export const b = 'ready';\n",
          },
          {
            path: "src/c.ts",
            kind: "update",
            content: "export const c = 'ready';\n",
          },
        ],
        atomicity: "verify-all-before-write",
      },
      {
        expectedFileCount: 3,
        writeFile: (file, content) => files.set(file, content),
        readFile: (file) => files.get(file),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.changedFiles).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
    expect(result.failedFiles).toEqual([]);
    expect(result.postWriteVerification).toBe("passed");
  });

  it("rejects unexpected file counts and non-update intents before writing", async () => {
    let writes = 0;
    const result = await applyMultiFileUpdateIntents(
      {
        ok: true,
        changedFiles: ["src/a.ts"],
        writeIntents: [
          {
            path: "src/a.ts",
            kind: "update",
            content: "ready\n",
          },
        ],
        atomicity: "verify-all-before-write",
      },
      {
        expectedFileCount: 2,
        writeFile: () => {
          writes += 1;
        },
        readFile: () => "ready\n",
      },
    );

    expect(result.ok).toBe(false);
    expect(result.changedFiles).toEqual([]);
    expect(result.failedFiles[0]?.code).toBe("patch-apply-plan-not-verified");
    expect(writes).toBe(0);
  });

  it("stops after a verified first file when the second writer fails without rollback", async () => {
    const files = new Map<string, string>();

    const result = await applyMultiFileUpdateIntents(updateContract, {
      expectedFileCount: 2,
      writeFile: (file, content) => {
        if (file === "src/b.ts") {
          throw new Error("simulated second write failure");
        }
        files.set(file, content);
      },
      readFile: (file) => files.get(file),
    });

    expect(result.ok).toBe(false);
    expect(result.changedFiles).toEqual(["src/a.ts"]);
    expect(result.failedFiles[0]).toEqual(
      expect.objectContaining({
        code: "patch-apply-write-failed",
        path: "src/b.ts",
      }),
    );
    expect(result.postWriteVerification).toBe("blocked");
    expect(files.get("src/a.ts")).toBe("export const a = 'ready';\n");
  });

  it("does not include an unverified second file when readback differs", async () => {
    const files = new Map<string, string>();

    const result = await applyMultiFileUpdateIntents(updateContract, {
      expectedFileCount: 2,
      writeFile: (file, content) => files.set(file, content),
      readFile: (file) =>
        file === "src/b.ts" ? "unexpected\n" : files.get(file),
    });

    expect(result.ok).toBe(false);
    expect(result.changedFiles).toEqual(["src/a.ts"]);
    expect(result.failedFiles[0]).toEqual(
      expect.objectContaining({
        code: "patch-apply-write-failed",
        path: "src/b.ts",
      }),
    );
    expect(result.postWriteVerification).toBe("failed");
  });
});
