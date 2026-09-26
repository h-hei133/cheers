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

describe("an edit whose text is not unique", () => {
  const twice = ["function alpha() {", "  return 1;", "}", "", "function beta() {", "  return 1;", "}", ""].join("\n");

  it("refuses rather than changing the first of several matches", () => {
    // The block is a valid exact match, so the old behaviour applied it to the
    // first occurrence and reported success: `beta` was never touched, and
    // nothing in the result said the edit had landed somewhere unintended.
    const res = replaceInContent(twice, "  return 1;", "  return 42;");

    expect(res.success).toBe(false);
    expect(res.content).toBe(twice);
    expect(res.error).toContain("2 occurrences");
  });

  it("names both ways to make the edit land", () => {
    // A refusal that does not say what to do next just costs a turn. Both
    // remedies are real: one argument replaces every occurrence, and more
    // context narrows it to one.
    const res = replaceInContent(twice, "  return 1;", "  return 42;");

    expect(res.error).toContain("replaceAll");
    expect(res.error).toMatch(/more context/i);
  });

  it("replaces every occurrence when asked to", () => {
    const res = replaceInContent(twice, "  return 1;", "  return 42;", { replaceAll: true });

    expect(res.success).toBe(true);
    expect(res.strategy).toBe("exact-all");
    expect(res.content.match(/return 42;/g)).toHaveLength(2);
  });

  it("still edits a text that appears once", () => {
    const original = "function alpha() {\n  return 1;\n}\n\nfunction beta() {\n  return 2;\n}\n";
    const res = replaceInContent(original, "  return 1;", "  return 42;");

    expect(res.success).toBe(true);
    expect(res.content).toContain("return 42;");
    expect(res.content).toContain("return 2;");
  });

  it("still reports a text that is not there at all", () => {
    const res = replaceInContent(twice, "  return 99;", "  return 42;");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/could not find/i);
  });

  it("does not count a resilient match, which is how one block is found", () => {
    // The trimmed and normalized strategies exist to locate the single block the
    // caller meant when the text does not match verbatim. Counting over those
    // would refuse an edit that has exactly one answer.
    const original = "function test() {\n    const x = 1;\n    const y = 2;\n}";
    const res = replaceInContent(original, "const x = 1;\n  const y = 2;", "  const sum = 3;");

    expect(res.success).toBe(true);
    expect(res.strategy).toBe("line-trimmed");
  });

  it("refuses a resilient match that has two answers, not one", () => {
    // The same block twice with different indentation. Neither matches verbatim,
    // so the trimmed strategy locates one of them — and picking the first is a
    // choice the request never made. Counting only verbatim hits found one and
    // edited it, which is the silent wrong-region edit this guard exists for.
    const original = "if (x) {\n    doThing();\n}\n\nif (x) {\n  doThing();\n}\n";
    const res = replaceInContent(original, "if (x) {\n\tdoThing();\n}", "if (x) {\n\tdone();\n}");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/2 occurrences/i);
    expect(res.content).toBe(original);
  });

  it("refuses a normalized match that has two answers, not one", () => {
    // Same text twice, written with curly quotes. Neither matches verbatim, so
    // the normalized strategy locates one of them.
    const original = "const a = \u201Cone\u201D;\nconst b = 0;\nconst a = \u201Cone\u201D;\n";
    const res = replaceInContent(original, 'const a = "one";', 'const a = "two";');

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/2 occurrences/i);
    expect(res.content).toBe(original);
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
