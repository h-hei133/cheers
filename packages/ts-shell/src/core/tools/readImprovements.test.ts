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
