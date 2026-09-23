import { describe, it, expect } from "vitest";
import { replaceInContent, replaceManyInContent } from "./editEngine.js";

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

describe("replaceManyInContent", () => {
  it("applies several replacements in one call", () => {
    const original = "const a = 1;\nconst b = 2;\nconst c = 3;";
    const result = replaceManyInContent(original, [
      { oldText: "const a = 1;", newText: "const a = 10;" },
      { oldText: "const c = 3;", newText: "const c = 30;" },
    ]);
    expect(result.success).toBe(true);
    expect(result.content).toBe("const a = 10;\nconst b = 2;\nconst c = 30;");
  });

  it("matches every segment against the original, not the running result", () => {
    // Matching incrementally would make each segment depend on the ones before
    // it, so two segments touching the same region would succeed or fail
    // depending on the order they were written down.
    const original = "first\nsecond";
    const result = replaceManyInContent(original, [
      { oldText: "first", newText: "FIRST" },
      // `second` is still where it was in the original, so this matches.
      { oldText: "second", newText: "SECOND" },
    ]);
    expect(result.success).toBe(true);
    expect(result.content).toBe("FIRST\nSECOND");
  });

  it("applies from the end, so an earlier replacement cannot shift a later one", () => {
    const original = "aaa\nbbb\nccc";
    const result = replaceManyInContent(original, [
      { oldText: "aaa", newText: "a much longer first line" },
      { oldText: "ccc", newText: "c" },
    ]);
    expect(result.content).toBe("a much longer first line\nbbb\nc");
  });

  it("refuses overlapping segments instead of guessing", () => {
    // There is no correct answer to "which of these two replacements of the same
    // characters did you mean", and guessing produces a file that matches
    // neither intent.
    const original = "the quick brown fox";
    const result = replaceManyInContent(original, [
      { oldText: "quick brown", newText: "slow red" },
      { oldText: "brown fox", newText: "red cat" },
    ]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("overlap");
    expect(result.error).toContain("edits[0]");
    expect(result.error).toContain("edits[1]");
  });

  it("writes nothing when one segment does not match", () => {
    const original = "alpha\nbeta";
    const result = replaceManyInContent(original, [
      { oldText: "alpha", newText: "ALPHA" },
      { oldText: "gamma", newText: "GAMMA" },
    ]);
    expect(result.success).toBe(false);
    expect(result.content).toBe(original);
    expect(result.error).toContain("edits[1]");
  });

  it("refuses an empty list rather than doing nothing quietly", () => {
    const result = replaceManyInContent("x", []);
    expect(result.success).toBe(false);
    expect(result.error).toContain("No edits");
  });

  it("refuses an empty segment", () => {
    const result = replaceManyInContent("x", [{ oldText: "", newText: "y" }]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("edits[0]");
  });

  it("applies the resilient strategies per segment", () => {
    // The single-edit form tolerates whitespace drift; the multi-edit form has
    // to do the same, or a call that works with one edit fails with two.
    const original = "function f() {\n    const x = 1;\n}";
    const result = replaceManyInContent(original, [
      { oldText: "const x = 1;", newText: "const x = 2;" },
    ]);
    expect(result.success).toBe(true);
    expect(result.content).toContain("const x = 2;");
  });
});
