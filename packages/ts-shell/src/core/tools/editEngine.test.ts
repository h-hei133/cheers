import { describe, it, expect } from "vitest";
import { replaceInContent } from "./editEngine.js";

describe("9-Stage Resilient File Replacer", () => {
  it("performs exact matching substitution", () => {
    const original = "function hello() {\n  return 'world';\n}";
    const res = replaceInContent(original, "return 'world';", "return 'universe';");
    expect(res.success).toBe(true);
    expect(res.strategy).toBe("exact");
    expect(res.content).toBe("function hello() {\n  return 'universe';\n}");
  });

  it("handles line-trimmed matching with whitespace discrepancies", () => {
    const original = "function test() {\n    const x = 1;\n    const y = 2;\n}";
    const search = "const x = 1;\n  const y = 2;"; // different indentation in search
    const replacement = "  const sum = 3;";
    const res = replaceInContent(original, search, replacement);
    expect(res.success).toBe(true);
    expect(res.strategy).toBe("line-trimmed");
    expect(res.content).toContain("const sum = 3;");
  });

  it("handles NFKC and smart quote normalization", () => {
    const original = "const msg = \u201CHello World\u201D;"; // smart curly quotes
    const search = 'const msg = "Hello World";'; // ascii double quotes
    const replacement = 'const msg = "Hi";';
    const res = replaceInContent(original, search, replacement);
    expect(res.success).toBe(true);
    expect(res.strategy).toBe("nfkc-normalized");
    expect(res.content).toBe('const msg = "Hi";');
  });

  it("handles block-anchor matching with fuzzy interior", () => {
    const original = [
      "class Worker {",
      "  constructor(id) {",
      "    this.id = id;",
      "    this.active = true;",
      "  }",
      "}",
    ].join("\n");

    const search = [
      "class Worker {",
      "  constructor(workerId) {",
      "    this.id = workerId;",
      "  }",
      "}",
    ].join("\n");

    const replacement = [
      "class Worker {",
      "  constructor(id) {",
      "    this.id = id;",
      "    this.ready = true;",
      "  }",
      "}",
    ].join("\n");

    const res = replaceInContent(original, search, replacement);
    expect(res.success).toBe(true);
    expect(res.strategy).toBe("block-anchor-levenshtein");
    expect(res.content).toContain("this.ready = true;");
  });
});
