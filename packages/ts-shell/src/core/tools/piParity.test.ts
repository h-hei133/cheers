import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyUnixReplacementsToOriginal } from "../../runtime/execution/fileText.js";
import { createDefaultExecutionService } from "../../runtime/execution/service.js";
import { createEditToolDefinition } from "../../edit/tool.js";
import { createGrepToolDefinition } from "./grep.js";
import { formatRipgrepMatch, forgetRipgrepBinary, parseRipgrepJson, ripgrepArgs } from "./grepRipgrep.js";
import { OutputAccumulator } from "./outputAccumulator.js";
import { normalizeToolPathInput, resolveReadablePathVariant, resolveToolTarget } from "./permissionContext.js";
import { createReadToolDefinition } from "./read.js";
import { truncateLineWidth, truncateTail } from "./truncation.js";

const tempDirs: string[] = [];

afterEach(() => {
  forgetRipgrepBinary();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-b3-"));
  tempDirs.push(dir);
  return dir;
}

describe("Pi path-utils parity", () => {
  it("strips @ prefix, normalizes Unicode spaces, expands ~, and decodes file:// URLs", () => {
    const root = makeWorkspace();
    expect(normalizeToolPathInput("@src/app.ts")).toBe("src/app.ts");
    expect(normalizeToolPathInput("hello\u00A0world\u202F.ts")).toBe("hello world .ts");
    expect(normalizeToolPathInput("~/notes.md")).toBe(path.join(os.homedir(), "notes.md"));
    expect(normalizeToolPathInput("file:///tmp/sample.txt")).toBe("/tmp/sample.txt");
    expect(resolveToolTarget({ path: "@src/main.ts" }, "path", root)).toBe(path.join(root, "src/main.ts"));
  });

  it("resolves macOS narrow-NBSP and curly-apostrophe variants inside jail on read", async () => {
    const root = makeWorkspace();
    const screenshot = "Screenshot 2026-11-14 at 10.00.00\u202FAM.png.txt";
    fs.writeFileSync(path.join(root, screenshot), "ok\n");
    const resolved = resolveReadablePathVariant(path.join(root, "Screenshot 2026-11-14 at 10.00.00 AM.png.txt"), root);
    expect(resolved).toBe(path.join(root, screenshot));

    const readTool = createReadToolDefinition(createDefaultExecutionService());
    const result = await readTool.execute(
      { path: "@Screenshot 2026-11-14 at 10.00.00 AM.png.txt" },
      { workspaceRoot: root, sessionId: "s1", taskId: "t1" },
    );
    expect(result.output).toContain("ok");
  });
});

describe("Pi truncation parity", () => {
  it("slices an oversized single trailing line by byte budget without splitting UTF-16 surrogates", () => {
    const emojiLine = "😀".repeat(60); // 240 UTF-8 bytes
    const result = truncateTail(emojiLine, { maxLines: 10, maxBytes: 25 });
    expect(result.truncated).toBe(true);
    expect(result.lastLinePartial).toBe(true);
    expect(Buffer.byteLength(result.content, "utf8")).toBeLessThanOrEqual(25);
    expect(result.content).not.toMatch(/[\uD800-\uDFFF]/u);
    expect(result.content.length).toBeGreaterThan(0);

    const widthCut = truncateLineWidth("a" + "😀".repeat(5), 2);
    expect(widthCut).toBe("a … [truncated]");
  });
});

describe("OutputAccumulator incremental spill", () => {
  it("emits buffered content once maxBytes overflows and streams subsequent chunks", () => {
    const spilled: string[] = [];
    const acc = new OutputAccumulator({
      maxBytes: 10,
      maxLines: 100,
      onOverflowSpill: (chunk) => spilled.push(chunk),
    });
    acc.append("12345");
    expect(spilled).toEqual([]);
    acc.append("67890A");
    expect(spilled).toEqual(["1234567890A"]);
    acc.append("BC");
    expect(spilled).toEqual(["1234567890A", "BC"]);
    acc.finish();
  });
});

describe("Pi grep literal and context support", () => {
  it("passes --fixed-strings and --context to ripgrep and formats context lines with -", () => {
    const args = ripgrepArgs({
      pattern: "a+b(c)",
      searchPath: ".",
      limit: 50,
      workspaceRoot: "/tmp",
      literal: true,
      context: 2,
    });
    expect(args).toContain("--fixed-strings");
    expect(args).toContain("--context");
    expect(args).toContain("2");

    const stream = [
      JSON.stringify({ type: "context", data: { path: { text: "f.ts" }, lines: { text: "before\n" }, line_number: 1 } }),
      JSON.stringify({ type: "match", data: { path: { text: "f.ts" }, lines: { text: "a+b(c)\n" }, line_number: 2 } }),
      JSON.stringify({ type: "context", data: { path: { text: "f.ts" }, lines: { text: "after\n" }, line_number: 3 } }),
    ].join("\n");
    const parsed = parseRipgrepJson(stream, 10);
    expect(parsed.map((m) => formatRipgrepMatch(m, 100))).toEqual([
      "f.ts-1- before",
      "f.ts:2: a+b(c)",
      "f.ts-3- after",
    ]);
  });

  it("supports literal and context in fallback search as well", async () => {
    const root = makeWorkspace();
    fs.writeFileSync(path.join(root, "sample.txt"), "line1\na+b(c)\nline3\n");
    const grepTool = createGrepToolDefinition(createDefaultExecutionService());
    const result = await grepTool.execute(
      { pattern: "a+b(c)", literal: true, context: 1 },
      { workspaceRoot: root, sessionId: "s1", taskId: "t1" },
    );
    expect(result.output).toContain("sample.txt-1- line1");
    expect(result.output).toContain("sample.txt:2: a+b(c)");
    expect(result.output).toContain("sample.txt-3- line3");
  });

  it("keeps searching past context-heavy files until match limit is actually reached", async () => {
    const root = makeWorkspace();
    for (let i = 0; i < 70; i++) {
      const name = `f${String(i).padStart(2, "0")}.txt`;
      const body = i === 0 || i === 69 ? "before1\nbefore2\nTARGET\nafter1\nafter2\n" : "nothing here\n";
      fs.writeFileSync(path.join(root, name), body);
    }
    const grepTool = createGrepToolDefinition(createDefaultExecutionService());
    const result = await grepTool.execute(
      { pattern: "TARGET", literal: true, context: 2, limit: 2 },
      { workspaceRoot: root, sessionId: "s1", taskId: "t1" },
    );
    expect(result.output).toContain("f00.txt:3: TARGET");
    expect(result.output).toContain("f69.txt:3: TARGET");
  });
});
describe("Pi edit line-ending preservation and firstChangedLine", () => {
  it("preserves untouched mixed line endings across replacements", async () => {
    const raw = "alpha\r\nbeta\ngamma\r\n";
    const edited = applyUnixReplacementsToOriginal(raw, [{ start: 6, end: 10, newText: "BETA" }]);
    expect(edited).toBe("alpha\r\nBETA\ngamma\r\n");

    const root = makeWorkspace();
    const target = path.join(root, "mixed.txt");
    fs.writeFileSync(target, raw);
    const editTool = createEditToolDefinition(createDefaultExecutionService());
    const res = await editTool.execute(
      { path: "mixed.txt", edits: [{ oldText: "beta", newText: "BETA" }] },
      { workspaceRoot: root, sessionId: "s1", taskId: "t1" },
    );
    expect(fs.readFileSync(target, "utf8")).toBe("alpha\r\nBETA\ngamma\r\n");
    expect(res.metadata?.firstChangedLine).toBe(2);
  });
});
