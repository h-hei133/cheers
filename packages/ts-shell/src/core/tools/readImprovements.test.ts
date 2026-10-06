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

  it("bounds a directory listing by bytes, not only by entry count", async () => {
    // Entry names are as long as the filesystem says. The entry cap bounds how
    // many there are, not how large the response is.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "read-dir-bytes-"));
    const filler = "z".repeat(180);
    for (let i = 0; i < 300; i++) {
      await fs.writeFile(path.join(dir, `${filler}-${String(i).padStart(4, "0")}.ts`), "x", "utf8");
    }

    const readTool = createCoreToolRegistry().get("read")!;
    const res = await readTool.execute(
      { path: "." },
      { workspaceRoot: dir, taskId: "t" } as never,
    );

    const bytes = Buffer.byteLength(res.output ?? "", "utf8");
    expect(bytes).toBeLessThanOrEqual(60 * 1024);
    expect(res.output).toMatch(/limit reached/i);

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
    expect(res.output).toContain("Line 1 exceeds the 50KB line limit");
    expect(res.output).toContain("byte-range inspection");
    expect(res.metadata?.read).toMatchObject({ stopReason: "output-limit", oversizedLine: 1 });
    expect(res.output).not.toContain("60KB"); // The rest of the line was not scanned.

    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("reading a file that has not changed", () => {
  async function withFile<T>(
    content: string,
    run: (input: { dir: string; file: string; sessionId: string }) => Promise<T>,
  ): Promise<T> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "read-dedup-"));
    const file = path.join(dir, "target.ts");
    await fs.writeFile(file, content, "utf8");
    try {
      return await run({ dir, file, sessionId: "sess-dedup" });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  function read(dir: string, sessionId: string, args: Record<string, unknown> = {}) {
    return createCoreToolRegistry()
      .get("read")!
      .execute({ path: "target.ts", ...args }, { workspaceRoot: dir, taskId: "t", sessionId } as never);
  }

  it("returns the requested content on every read", async () => {
    await withFile("line one\nline two\n", async ({ dir, sessionId }) => {
      const first = await read(dir, sessionId);
      expect(first.output).toContain("line one");

      const second = await read(dir, sessionId);
      expect(second.success).toBe(true);
      expect(second.output).toBe("line one\nline two\n");
    });
  });

  it("returns the content again once the file has changed", async () => {
    // A new modification time must expose the new content too.
    await withFile("before\n", async ({ dir, file, sessionId }) => {
      await read(dir, sessionId);
      await fs.writeFile(file, "after\n", "utf8");
      const later = new Date(Date.now() + 2_000);
      await fs.utimes(file, later, later);

      const second = await read(dir, sessionId);
      expect(second.output).toContain("after");
      expect(second.output).not.toContain("unchanged");
    });
  });

  it("reads again when a different range is asked for", async () => {
    await withFile("one\ntwo\nthree\nfour\n", async ({ dir, sessionId }) => {
      await read(dir, sessionId, { offset: 1, limit: 2 });

      const different = await read(dir, sessionId, { offset: 3, limit: 2 });
      expect(different.output).toContain("three");
      expect(different.output).not.toContain("unchanged");
    });
  });

  it("returns the content again after the file is edited", async () => {
    // The existing edit path must remain visible through the next read.
    await withFile("value = 1\n", async ({ dir, sessionId }) => {
      const registry = createCoreToolRegistry();
      await registry.get("read")!.execute(
        { path: "target.ts" },
        { workspaceRoot: dir, taskId: "t", sessionId } as never,
      );
      await registry.get("edit")!.execute(
        { path: "target.ts", oldText: "value = 1", newText: "value = 2" },
        { workspaceRoot: dir, taskId: "t", sessionId } as never,
      );

      const after = await registry.get("read")!.execute(
        { path: "target.ts" },
        { workspaceRoot: dir, taskId: "t", sessionId } as never,
      );
      expect(after.output).toContain("value = 2");
      expect(after.output).not.toContain("unchanged");
    });
  });

  it("returns the content again after the file is written", async () => {
    await withFile("value = 1\n", async ({ dir, sessionId }) => {
      const registry = createCoreToolRegistry();
      await registry.get("read")!.execute(
        { path: "target.ts" },
        { workspaceRoot: dir, taskId: "t", sessionId } as never,
      );
      await registry.get("write")!.execute(
        { path: "target.ts", content: "rewritten\n" },
        { workspaceRoot: dir, taskId: "t", sessionId } as never,
      );

      const after = await registry.get("read")!.execute(
        { path: "target.ts" },
        { workspaceRoot: dir, taskId: "t", sessionId } as never,
      );
      expect(after.output).toContain("rewritten");
      expect(after.output).not.toContain("unchanged");
    });
  });

  it("does not dedupe across sessions", async () => {
    // A new conversation has not seen the file, so a pointer would refer to
    // something the model cannot see.
    await withFile("only here\n", async ({ dir }) => {
      await read(dir, "session-one");
      const other = await read(dir, "session-two");

      expect(other.output).toContain("only here");
      expect(other.output).not.toContain("unchanged");
    });
  });

  it("does not dedupe a read that showed only part of the file", async () => {
    // A partial read showed a part, and a later read of the same request must go
    // to disk: pointing the model at a part would let it take the part for the
    // file. This is the case a size limit produces — 1,600 short lines stay
    // under the byte ceiling and are cut by the line limit instead.
    const manyLines = Array.from({ length: 1_600 }, (_, index) => `line ${index}`).join("\n");
    await withFile(manyLines, async ({ dir, sessionId }) => {
      const first = await read(dir, sessionId);
      expect(first.output).toContain("Showing lines 1-500 of an uncounted file");
      expect(first.output).toContain("offset=501");
      expect(first.metadata?.read).toMatchObject({ stopReason: "line-limit", nextOffset: 501 });

      const second = await read(dir, sessionId);
      expect(second.output).not.toContain("unchanged");
      expect(second.output).toContain("line 0");
    });
  });

  it("does not dedupe a read stopped by the line byte budget", async () => {
    // The line was withheld, so the model never saw the file.
    const hugeLine = "var bundle=" + "x".repeat(60 * 1024);
    await withFile(hugeLine, async ({ dir, sessionId }) => {
      const first = await read(dir, sessionId);
      expect(first.output).toContain("exceeds the 50KB line limit");

      const second = await read(dir, sessionId);
      expect(second.output).not.toContain("unchanged");
    });
  });
});
