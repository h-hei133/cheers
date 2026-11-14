import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyUnixReplacementsToOriginal } from "../../runtime/execution/fileText.js";
import { createDefaultExecutionService } from "../../runtime/execution/service.js";
import { ArtifactManager } from "../session/artifactManager.js";
import { createToolResultMessage } from "../agent/tools.js";
import { createEditToolDefinition } from "../../edit/tool.js";
import { createGrepToolDefinition } from "./grep.js";
import { formatRipgrepMatch, forgetRipgrepBinary, parseRipgrepJson, ripgrepArgs } from "./grepRipgrep.js";
import { normalizeToolPathInput, resolveReadablePathVariant, resolveToolTarget } from "./permissionContext.js";
import { createReadToolDefinition } from "./read.js";
import { truncateLineWidth, truncateTail } from "./truncation.js";

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

describe("Tool paths", () => {
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

describe("Tool output bounds", () => {
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

describe("Search literal and context support", () => {
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
    vi.stubEnv("PATH", root);
    fs.writeFileSync(path.join(root, "sample.txt"), "line1\na+b(c)\nline3\n");
    const service = createDefaultExecutionService();
    const list = vi.spyOn(service, "listFilesRecursive");
    const grepTool = createGrepToolDefinition(service);
    const result = await grepTool.execute(
      { pattern: "a+b(c)", literal: true, context: 1 },
      { workspaceRoot: root, sessionId: "s1", taskId: "t1" },
    );
    expect(result.output).toContain("sample.txt-1- line1");
    expect(result.output).toContain("sample.txt:2: a+b(c)");
    expect(result.output).toContain("sample.txt-3- line3");
    expect(list).toHaveBeenCalled();
  });

  it.each(["native", "fallback"] as const)("retains overlapping context as distinct matching lines in %s search", async mode => {
    const root = makeWorkspace();
    if (mode === "fallback") vi.stubEnv("PATH", root);
    fs.writeFileSync(path.join(root, "sample.txt"), "before\nTARGET one\nTARGET two\nafter\n");
    const service = createDefaultExecutionService();
    const list = vi.spyOn(service, "listFilesRecursive");
    const result = await createGrepToolDefinition(service).execute(
      { pattern: "TARGET", literal: true, context: 1, limit: 2 },
      { workspaceRoot: root, sessionId: "matches", taskId: "matches" },
    );

    expect(result.success).toBe(true);
    expect(result.output?.split("\n")).toEqual([
      "sample.txt-1- before",
      "sample.txt:2: TARGET one",
      "sample.txt:3: TARGET two",
      "sample.txt-4- after",
    ]);
    if (mode === "native") expect(list).not.toHaveBeenCalled();
    else expect(list).toHaveBeenCalled();
  });

  it("preserves the published search artifact locator through the shared tool receipt bound", async () => {
    const root = makeWorkspace();
    vi.stubEnv("PATH", root);
    const source = Array.from({ length: 130 }, (_, index) => `TARGET-${index} ${"界".repeat(180)}`).join("\n");
    fs.writeFileSync(path.join(root, "sample.txt"), source);
    const result = await createGrepToolDefinition(createDefaultExecutionService()).execute(
      { pattern: "TARGET", literal: true, limit: 130 },
      { workspaceRoot: root, sessionId: "spill", taskId: "spill" },
    );

    expect(result.success).toBe(true);
    const notice = result.metadata?.outputNotice;
    expect(typeof notice).toBe("string");
    const locator = typeof notice === "string" ? /artifact:\/\/\d+/.exec(notice)?.[0] : undefined;
    expect(locator).toBeDefined();
    const artifactPath = ArtifactManager.getShared(root, "spill").resolve(locator!);
    expect(artifactPath).not.toBeNull();
    const saved = fs.readFileSync(artifactPath!, "utf8");
    expect(saved).toContain("sample.txt:130: TARGET-129");
    const message = createToolResultMessage("search", result.output!, result.metadata);
    expect(message.content).toContain(locator);
    expect(message.metadata?.outputNotice).toBe(notice);
    expect(Buffer.byteLength(message.content as string, "utf8")).toBeLessThanOrEqual(50 * 1024);
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
describe("Edit line endings and changed-line projection", () => {
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
