import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createCoreToolRegistry } from "./registry.js";
import { matchesGlob } from "./globMatch.js";

/**
 * A directory holding `count` files, plus a nested directory so a pattern that
 * recurses has something to recurse into.
 */
async function makeTree(count: number): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "glob-cap-"));
  await fs.mkdir(path.join(dir, "nested"));
  for (let i = 0; i < count; i++) {
    const name = `file-${String(i).padStart(5, "0")}.ts`;
    await fs.writeFile(path.join(dir, name), "x", "utf8");
  }
  await fs.writeFile(path.join(dir, "nested", "inner.ts"), "x", "utf8");
  return dir;
}

describe("glob pattern matching", () => {
  it("matches a root-level file with a recursive pattern", () => {
    // The double-star form has to match zero directories as well as some, which
    // is what makes it the form callers reach for. Both previous copies of this
    // matcher failed it.
    expect(matchesGlob("a.ts", "**/*.ts")).toBe(true);
    expect(matchesGlob("src/a.ts", "**/*.ts")).toBe(true);
  });

  it("matches a file under a named directory with a recursive pattern", () => {
    expect(matchesGlob("src/a.ts", "src/**/*.ts")).toBe(true);
    expect(matchesGlob("src/deep/a.ts", "src/**/*.ts")).toBe(true);
  });

  it("keeps a single star within one directory level", () => {
    expect(matchesGlob("src/a.ts", "src/*.ts")).toBe(true);
    expect(matchesGlob("src/deep/a.ts", "src/*.ts")).toBe(false);
  });

  it("matches a bare pattern against the basename at any depth", () => {
    // `*.json` means "any json file", which is what a file search is expected to
    // do and what the pattern's own description promises.
    expect(matchesGlob("package.json", "*.json")).toBe(true);
    expect(matchesGlob("config/settings.json", "*.json")).toBe(true);
  });

  it("stays case-insensitive", () => {
    expect(matchesGlob("Package.json", "*.json")).toBe(true);
  });

  it("accepts a Windows-style separator in a pattern that uses no escape sequences", () => {
    // A backslash that is not escaping anything can only be a separator, and
    // in POSIX mode it matches nothing at all — converting it is all gain.
    expect(matchesGlob("src/packages/a.ts", "src\\packages\\a.ts")).toBe(true);
    expect(matchesGlob("other/a.ts", "src\\packages\\a.ts")).toBe(false);
  });

  it("does not rewrite a pattern whose backslash escapes a wildcard", () => {
    // `src\**\*.ts` reads, in POSIX mode, as escaped stars — and rewriting the
    // backslashes would change which characters the pattern names. Windows
    // callers typing that form lose nothing they had: it matched nothing
    // before either. The escape reading wins because it is the one with
    // existing matches to protect.
    expect(matchesGlob("src/a.ts", "src\\**\\*.ts")).toBe(false);
    expect(matchesGlob("src/a.ts", "src/**/*.ts")).toBe(true);
    expect(matchesGlob("foo*.ts", "foo\\*.ts")).toBe(true);
    expect(matchesGlob("foo/a.ts", "foo\\*.ts")).toBe(false);
    expect(matchesGlob("a\\b.ts", "a\\\\b.ts")).toBe(true);
    expect(matchesGlob("a/b.ts", "a\\\\b.ts")).toBe(false);
  });

  it("treats a Windows relative prefix the way the POSIX spelling is treated", () => {
    // `.\a.ts` and `./a.ts` are the same instruction. Stripping the prefix before
    // normalizing left the backslash form with a separator still in it, which then
    // suppressed the basename fallback: the POSIX spelling found `src/a.ts` and the
    // Windows one did not.
    expect(matchesGlob("src/a.ts", ".\\a.ts")).toBe(true);
    expect(matchesGlob("src/a.ts", "./a.ts")).toBe(true);
    expect(matchesGlob("a.ts", ".\\a.ts")).toBe(true);
  });
});

describe("glob result cap", () => {
  it("bounds how many entries it returns for a workspace-wide pattern", async () => {
    const dir = await makeTree(1200);
    const globTool = createCoreToolRegistry().get("glob")!;

    const res = await globTool.execute(
      { pattern: "**/*.ts" },
      { workspaceRoot: dir, taskId: "t" } as never,
    );

    expect(res.success).toBe(true);
    // 1201 matches exist; the cap must hold the output to one page.
    const returned = (res.output ?? "")
      .split("\n")
      .filter((line) => line.startsWith("file-")).length;
    expect(returned).toBeLessThanOrEqual(1000);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("tells the model the result was cut off and how to see more", async () => {
    const dir = await makeTree(1200);
    const globTool = createCoreToolRegistry().get("glob")!;

    const res = await globTool.execute(
      { pattern: "**/*.ts" },
      { workspaceRoot: dir, taskId: "t" } as never,
    );

    const output = res.output ?? "";
    expect(output).toContain("1201");
    expect(output.toLowerCase()).toContain("limit");

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("honours a caller-supplied limit within the ceiling", async () => {
    const dir = await makeTree(50);
    const globTool = createCoreToolRegistry().get("glob")!;

    const res = await globTool.execute(
      { pattern: "**/*.ts", limit: 10 },
      { workspaceRoot: dir, taskId: "t" } as never,
    );

    const returned = (res.output ?? "")
      .split("\n")
      .filter((line) => line.startsWith("file-")).length;
    expect(returned).toBe(10);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("does not announce truncation when every match fits", async () => {
    const dir = await makeTree(3);
    const globTool = createCoreToolRegistry().get("glob")!;

    const res = await globTool.execute(
      { pattern: "**/*.ts" },
      { workspaceRoot: dir, taskId: "t" } as never,
    );

    const output = res.output ?? "";
    expect(output).toContain("file-00000.ts");
    expect(output).not.toContain("Showing");

    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("glob byte cap", () => {
  /**
   * A tree whose direct children have very long names.
   *
   * A count cap alone does not bound the response: path length is what turns
   * "a thousand entries" into hundreds of kilobytes. These names are long enough
   * that the default page exceeds the byte budget.
   */
  async function makeLongNameTree(count: number): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "glob-bytes-"));
    const filler = "z".repeat(180);
    for (let i = 0; i < count; i++) {
      await fs.writeFile(path.join(dir, `${filler}-${String(i).padStart(4, "0")}.ts`), "x", "utf8");
    }
    return dir;
  }

  it("bounds the bytes it returns, not only the number of entries", async () => {
    const dir = await makeLongNameTree(500);
    const globTool = createCoreToolRegistry().get("glob")!;

    const res = await globTool.execute(
      { pattern: "**/*.ts" },
      { workspaceRoot: dir, taskId: "t" } as never,
    );

    const bytes = Buffer.byteLength(res.output ?? "", "utf8");
    expect(bytes).toBeLessThanOrEqual(60 * 1024);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("says the output was cut short, not just that entries were withheld", async () => {
    const dir = await makeLongNameTree(500);
    const globTool = createCoreToolRegistry().get("glob")!;

    const res = await globTool.execute(
      { pattern: "**/*.ts" },
      { workspaceRoot: dir, taskId: "t" } as never,
    );

    // A caller has to be able to tell "these are all of them" from "the rest did
    // not fit", which is a different fact from the entry count running out.
    expect(res.output).toMatch(/limit reached|KB/i);

    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("patterns naming hidden files", () => {
  /** A tree holding hidden entries alongside ordinary ones. */
  async function makeHiddenTree(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "glob-hidden-"));
    await fs.writeFile(path.join(dir, ".gitignore"), "x", "utf8");
    await fs.writeFile(path.join(dir, "plain.ts"), "x", "utf8");
    await fs.mkdir(path.join(dir, ".github"));
    await fs.writeFile(path.join(dir, ".github", "ci.yml"), "x", "utf8");
    await fs.mkdir(path.join(dir, "src"));
    await fs.writeFile(path.join(dir, "src", "a.ts"), "x", "utf8");
    return dir;
  }

  it("finds a named hidden file instead of searching for a truncated name", async () => {
    // `.gitignore` must match `.gitignore`. Stripping the leading dot turned the
    // pattern into `gitignore`, which matches nothing and reports "no files".
    const dir = await makeHiddenTree();
    const globTool = createCoreToolRegistry().get("glob")!;

    const res = await globTool.execute(
      { pattern: ".gitignore" },
      { workspaceRoot: dir, taskId: "t" } as never,
    );

    expect(res.output).toContain(".gitignore");

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("finds files under a hidden directory", async () => {
    const dir = await makeHiddenTree();
    const globTool = createCoreToolRegistry().get("glob")!;

    const res = await globTool.execute(
      { pattern: ".github/**/*.yml" },
      { workspaceRoot: dir, taskId: "t" } as never,
    );

    expect(res.output).toContain("ci.yml");

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("still accepts a pattern written with a leading ./", async () => {
    const dir = await makeHiddenTree();
    const globTool = createCoreToolRegistry().get("glob")!;

    const res = await globTool.execute(
      { pattern: "./src/*.ts" },
      { workspaceRoot: dir, taskId: "t" } as never,
    );

    expect(res.output).toContain("a.ts");

    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("both caps reached at once", () => {
  it("does not name two different shown counts in one answer", async () => {
    // When the byte budget cuts the page, the count cap's notice would report a
    // larger "showing N of M" for the same answer, and would advise raising the
    // limit — advice that cannot work, since the next page meets the same budget.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "glob-both-"));
    const filler = "z".repeat(200);
    for (let i = 0; i < 1500; i++) {
      await fs.writeFile(path.join(dir, `${filler}-${String(i).padStart(5, "0")}.ts`), "x", "utf8");
    }

    const res = await createCoreToolRegistry().get("glob")!.execute(
      { pattern: "**/*.ts" },
      { workspaceRoot: dir, taskId: "t" } as never,
    );

    const output = res.output ?? "";
    const shownCounts = output.match(/showing \d+ of/g) ?? [];
    expect(shownCounts).toHaveLength(1);
    expect(output).not.toContain("for more");

    await fs.rm(dir, { recursive: true, force: true });
  });
});
