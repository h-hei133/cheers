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
