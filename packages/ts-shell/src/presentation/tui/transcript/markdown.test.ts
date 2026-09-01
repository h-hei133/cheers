import { describe, expect, it } from "vitest";
import { renderInline, renderMarkdown, trimPartialFence } from "./markdown.js";
import { visibleWidth } from "../text/measure.js";
import { stripAnsi } from "../text/ansi.js";

const WIDTH = 40;

const plain = (rows: readonly string[]): string => rows.map(stripAnsi).join("\n");

describe("inline styling", () => {
  it("removes the markup and keeps the words", () => {
    expect(stripAnsi(renderInline("a **bold** and *italic* word"))).toBe("a bold and italic word");
  });

  it("renders a code span without its backticks", () => {
    expect(stripAnsi(renderInline("call `run()` now"))).toBe("call  run()  now");
  });

  it("shows a link label with its target", () => {
    expect(stripAnsi(renderInline("[docs](https://x/y)"))).toBe("docs (https://x/y)");
  });

  it("leaves plain prose untouched", () => {
    expect(renderInline("nothing to do here")).toBe("nothing to do here");
  });
});

describe("block structure", () => {
  it("renders headings without their hashes", () => {
    expect(plain(renderMarkdown("## Results", WIDTH))).toBe("Results");
  });

  it("renders bullets and numbered items with aligned continuations", () => {
    const rows = renderMarkdown("- first item that is long enough to wrap twice over", 20);
    expect(stripAnsi(rows[0]!).startsWith("• ")).toBe(true);
    expect(stripAnsi(rows[1]!).startsWith("  ")).toBe(true);
    expect(plain(renderMarkdown("1. step one", WIDTH))).toBe("1. step one");
  });

  it("marks a blockquote with a rail", () => {
    expect(plain(renderMarkdown("> quoted", WIDTH))).toBe("▏ quoted");
  });

  it("renders a horizontal rule at the full width", () => {
    expect(visibleWidth(renderMarkdown("---", WIDTH)[0]!)).toBe(WIDTH);
  });

  it("frames a fenced block and labels its language", () => {
    const rows = renderMarkdown("```ts\nconst x = 1;\n```", WIDTH);
    expect(stripAnsi(rows[0]!)).toContain("ts");
    expect(plain(rows)).toContain("const x = 1;");
    expect(stripAnsi(rows.at(-1)!)).toMatch(/^└─+┘$/);
  });

  it("closes an unterminated fence at the end of the text", () => {
    const rows = renderMarkdown("```\nunfinished", WIDTH);
    expect(plain(rows)).toContain("unfinished");
    expect(stripAnsi(rows.at(-1)!)).toMatch(/^└─+┘$/);
  });

  it("keeps every row inside the width", () => {
    const source = "# Title\n\nSome **long** prose that should wrap at this narrow width.\n\n- a bullet item that also wraps\n\n```js\nconst value = 12345678901234567890;\n```";
    for (const row of renderMarkdown(source, 24)) {
      expect(visibleWidth(row)).toBeLessThanOrEqual(24);
    }
  });
});

describe("streaming stability", () => {
  it("drops a trailing partial fence", () => {
    expect(trimPartialFence("text\n``")).toBe("text");
    expect(trimPartialFence("text\n`")).toBe("text");
  });

  it("keeps a complete fence", () => {
    expect(trimPartialFence("text\n```")).toBe("text\n```");
  });

  it("keeps ordinary trailing text", () => {
    expect(trimPartialFence("text\nmore")).toBe("text\nmore");
  });
});
