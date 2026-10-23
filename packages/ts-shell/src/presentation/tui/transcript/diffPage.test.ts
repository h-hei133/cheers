import { describe, expect, it } from "vitest";
import {
  boundDiffLines,
  countDiffLines,
  diffNeedsFullView,
  nextDiffPage,
} from "./diffPage.js";

describe("bounded diff source", () => {
  it("keeps the exact byte and row boundary without allocating the remainder", () => {
    expect(boundDiffLines("-a\n+b", 5, 2)).toEqual({ lines: ["-a", "+b"], truncated: false });
    expect(boundDiffLines("-a\n+b", 4, 2)).toEqual({ lines: ["-a"], truncated: true });
    expect(boundDiffLines("-a\n+b\n", 6, 2)).toEqual({ lines: ["-a", "+b", ""], truncated: false });
    expect(boundDiffLines("one\ntwo", 1024, 1)).toEqual({ lines: ["one"], truncated: true });
  });

  it("counts the preview threshold from both budgets", () => {
    expect(diffNeedsFullView("-a\n+b", 5, 2)).toBe(false);
    expect(diffNeedsFullView("-a\n+b", 4, 2)).toBe(true);
    expect(diffNeedsFullView("one\ntwo", 1024, 1)).toBe(true);
  });

  it("counts logical lines without materializing a split array", () => {
    expect(countDiffLines("")).toBe(0);
    expect(countDiffLines("one")).toBe(1);
    expect(countDiffLines("one\n")).toBe(1);
    expect(countDiffLines("one\ntwo\n")).toBe(2);
  });
});

describe("diff pager pages", () => {
  const diff = "@@ -3,2 +3,2 @@\n-old\n+new\n same\n";

  it("carries old/new line counters across a split hunk", () => {
    const first = nextDiffPage(diff, 0, 0, 0, false, 2, 1024);
    expect(first.text).toBe("@@ -3,2 +3,2 @@\n-old\n");
    expect(first).toMatchObject({ oldLine: 4, newLine: 3, inHunk: true });
    const second = nextDiffPage(diff, first.next!, first.oldLine, first.newLine, first.inHunk, 2, 1024);
    expect(second.text).toBe("+new\n same\n");
    expect(second).toMatchObject({ oldLine: 5, newLine: 5, inHunk: true });
    expect(second.next).toBeUndefined();
  });

  it("marks a single oversized line and advances to the next source line", () => {
    const page = nextDiffPage(`+${"x".repeat(100)}\n+next\n`, 0, 0, 0, false, 10, 32);
    expect(page.text).toContain("diff line truncated by the view budget");
    expect(page.text).not.toContain("+next");
    expect(page.next).toBe(102);
    expect(page.newLine).toBe(1);
    const next = nextDiffPage(`+${"x".repeat(100)}\n+next\n`, page.next, page.oldLine, page.newLine, page.inHunk);
    expect(next.text).toBe("+next\n");
    expect(next.newLine).toBe(2);
  });

  it("does not split a UTF-8 code point when the first line exceeds the byte budget", () => {
    const page = nextDiffPage("+🙂🙂🙂\n", 0, 0, 0, false, 10, 18);
    expect(page.text).toContain("+");
    expect(page.text).not.toContain("\ufffd");
    expect(Buffer.from(page.text, "utf8").toString("utf8")).toBe(page.text);
  });
});
