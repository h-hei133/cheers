import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createCoreToolRegistry } from "./registry.js";
import { truncateHead } from "./truncation.js";

describe("read tool improvements", () => {
  it("strips BOM when reading a file so model gets clean text", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "read-bom-"));
    const file = path.join(dir, "bom.txt");
    await fs.writeFile(file, "\uFEFFHello World\nLine 2\n", "utf8");

    const readTool = createCoreToolRegistry().get("read")!;
    const res = await readTool.execute(
      { path: "bom.txt" },
      { workspaceRoot: dir, taskId: "t" } as never
    );

    expect(res.success).toBe(true);
    expect(res.output).toContain("Hello World");
    expect(res.output!.startsWith("\uFEFF")).toBe(false);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("lists a directory's direct entries instead of raising a raw fs error", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "read-dir-"));
    await fs.mkdir(path.join(dir, "sub"));
    await fs.writeFile(path.join(dir, "b.ts"), "x", "utf8");
    await fs.writeFile(path.join(dir, "a.ts"), "x", "utf8");
    await fs.writeFile(path.join(dir, "sub", "deep.ts"), "x", "utf8");

    const readTool = createCoreToolRegistry().get("read")!;
    const res = await readTool.execute(
      { path: "." },
      { workspaceRoot: dir, taskId: "t" } as never
    );

    // Direct entries only: `sub/deep.ts` is a grandchild and belongs to glob.
    expect(res.success).toBe(true);
    expect(res.output).toContain("a.ts");
    expect(res.output).toContain("b.ts");
    expect(res.output).toContain("sub/");
    expect(res.output).not.toContain("deep.ts");

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("orders directory listings with directories first, then alphabetically", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "read-dir-order-"));
    await fs.mkdir(path.join(dir, "zeta"));
    await fs.mkdir(path.join(dir, "alpha"));
    await fs.writeFile(path.join(dir, "beta.ts"), "x", "utf8");

    const readTool = createCoreToolRegistry().get("read")!;
    const res = await readTool.execute(
      { path: "." },
      { workspaceRoot: dir, taskId: "t" } as never
    );

    const output = res.output ?? "";
    const alpha = output.indexOf("alpha/");
    const zeta = output.indexOf("zeta/");
    const beta = output.indexOf("beta.ts");
    expect(alpha).toBeGreaterThan(-1);
    expect(zeta).toBeGreaterThan(alpha);
    expect(beta).toBeGreaterThan(zeta);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("does not report an empty directory as an error", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "read-dir-empty-"));
    await fs.mkdir(path.join(dir, "hollow"));

    const readTool = createCoreToolRegistry().get("read")!;
    const res = await readTool.execute(
      { path: "hollow" },
      { workspaceRoot: dir, taskId: "t" } as never
    );

    expect(res.success).toBe(true);
    expect(res.output).toContain("empty");

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("lists a directory without the entries the walk policy excludes", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "read-dir-ignore-"));
    await fs.mkdir(path.join(dir, "node_modules"));
    await fs.writeFile(path.join(dir, "node_modules", "dep.js"), "x", "utf8");
    await fs.writeFile(path.join(dir, ".gitignore"), "ignored.txt\n", "utf8");
    await fs.writeFile(path.join(dir, "ignored.txt"), "x", "utf8");
    await fs.writeFile(path.join(dir, "kept.ts"), "x", "utf8");

    const readTool = createCoreToolRegistry().get("read")!;
    const res = await readTool.execute(
      { path: "." },
      { workspaceRoot: dir, taskId: "t" } as never
    );

    const output = res.output ?? "";
    expect(output).toContain("kept.ts");
    expect(output).not.toContain("dep.js");
    expect(output).not.toContain("ignored.txt");

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("says how many entries it withheld rather than showing a partial listing as complete", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "read-dir-omitted-"));
    await fs.writeFile(path.join(dir, ".gitignore"), "secret.txt\n", "utf8");
    await fs.writeFile(path.join(dir, "secret.txt"), "x", "utf8");
    await fs.writeFile(path.join(dir, "kept.ts"), "x", "utf8");

    const readTool = createCoreToolRegistry().get("read")!;
    const res = await readTool.execute(
      { path: "." },
      { workspaceRoot: dir, taskId: "t" } as never,
    );

    const output = res.output ?? "";
    expect(output).toContain("kept.ts");
    expect(output).toContain("1 entry omitted");

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("does not call a directory empty when every entry was withheld", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "read-dir-allhidden-"));
    await fs.writeFile(path.join(dir, ".gitignore"), "*.log\n", "utf8");
    await fs.writeFile(path.join(dir, "a.log"), "x", "utf8");

    const readTool = createCoreToolRegistry().get("read")!;
    const res = await readTool.execute(
      { path: "." },
      { workspaceRoot: dir, taskId: "t" } as never,
    );

    const output = res.output ?? "";
    expect(output).not.toContain("is empty");
    expect(output).toContain("omitted");

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("pages a large directory and says how to see the rest", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "read-dir-page-"));
    for (let i = 0; i < 12; i++) {
      await fs.writeFile(path.join(dir, `f-${String(i).padStart(2, "0")}.ts`), "x", "utf8");
    }

    const readTool = createCoreToolRegistry().get("read")!;
    const first = await readTool.execute(
      { path: ".", limit: 5 },
      { workspaceRoot: dir, taskId: "t" } as never,
    );

    const output = first.output ?? "";
    expect(output).toContain("f-00.ts");
    expect(output).not.toContain("f-11.ts");
    expect(output).toContain("offset=6");

    const second = await readTool.execute(
      { path: ".", limit: 5, offset: 6 },
      { workspaceRoot: dir, taskId: "t" } as never,
    );
    expect(second.output ?? "").toContain("f-05.ts");

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("handles oversized single line by dropping it and providing actionable bash fallback", () => {
    const hugeLine = "A".repeat(60 * 1024);
    const result = truncateHead(hugeLine + "\nshort line", { maxBytes: 50 * 1024 });

    expect(result.truncated).toBe(true);
    expect(result.firstLineExceedsLimit).toBe(true);
    expect(result.content).toBe("");
    expect(result.firstLineBytes).toBe(60 * 1024);
  });

  it("integration: read tool outputs actionable fallback when line 1 exceeds budget", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "read-longline-"));
    const file = path.join(dir, "bundle.min.js");
    const hugeLine = "var bundle=" + "x".repeat(60 * 1024);
    await fs.writeFile(file, hugeLine, "utf8");

    const readTool = createCoreToolRegistry().get("read")!;
    const res = await readTool.execute(
      { path: "bundle.min.js" },
      { workspaceRoot: dir, taskId: "t" } as never
    );

    expect(res.success).toBe(true);
    expect(res.output).toContain("Line 1 is");
    expect(res.output).toContain("exceeds 50KB limit");
    expect(res.output).toContain("Use bash: sed -n '1p' bundle.min.js | head -c 51200");

    await fs.rm(dir, { recursive: true, force: true });
  });
});
