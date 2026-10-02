import { afterEach, describe, expect, it } from "vitest";
import { setDiagramMode } from "./mermaid.js";
import { renderInline, renderMarkdown, trimPartialFence } from "./markdown.js";
import { visibleWidth } from "../text/measure.js";
import { stripAnsi } from "../text/ansi.js";
import { defaultTheme } from "../../theme/theme.js";
import { getDefaultTheme } from "../../themes/index.js";

const WIDTH = 40;

const plain = (rows: readonly string[]): string => rows.map(stripAnsi).join("\n");

describe("inline styling", () => {
  it("removes the markup and keeps the words", () => {
    expect(stripAnsi(renderInline("a **bold** and *italic* word"))).toBe("a bold and italic word");
  });

  it("renders a code span without its backticks", () => {
    expect(stripAnsi(renderInline("call `run()` now"))).toBe("call run() now");
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

  it("highlights an entire fence before wrapping its lines", () => {
    defaultTheme.apply(getDefaultTheme(), "truecolor");
    try {
      const rows = renderMarkdown("```js\n/* first\nsecond */\nconst value = 1234567890;\n```", 18);
      expect(rows[2]).toContain(defaultTheme.fg("syntaxComment", "second */"));
      expect(rows[3]).toContain(defaultTheme.fg("syntaxKeyword", "const"));
      for (const row of rows) expect(visibleWidth(row)).toBeLessThanOrEqual(18);
    } finally {
      defaultTheme.apply(getDefaultTheme(), "none");
    }
  });

  it.each(["", "unknown"])("uses the syntax text color for a %s fallback fence", (language) => {
    defaultTheme.apply({ ...getDefaultTheme(), colors: { ...getDefaultTheme().colors, syntaxText: "#123456" } }, "truecolor");
    try {
      expect(renderMarkdown(`\x60\x60\x60${language}\nplain body\n\x60\x60\x60`, 30)[1])
        .toContain("\x1b[38;2;18;52;86mplain body\x1b[39m");
    } finally {
      defaultTheme.apply(getDefaultTheme(), "none");
    }
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

describe("tables", () => {
  const TABLE = [
    "| Name | State | From |",
    "| :--- | :--- | :--- |",
    "| alpha | enabled | ./tools/alpha |",
    "| beta | unresolved | beta-package |",
  ].join("\n");

  it("aligns cells into columns rather than leaving the pipes in place", () => {
    const rows = plain(renderMarkdown(TABLE, 60)).split("\n");
    const header = rows.find((row) => row.includes("Name"))!;
    const alpha = rows.find((row) => row.includes("alpha"))!;

    expect(header.indexOf("State")).toBe(alpha.indexOf("enabled"));
    expect(header).not.toContain("|");
  });

  it("keeps a separator rule out of the body", () => {
    expect(plain(renderMarkdown(TABLE, 60))).not.toContain(":---");
  });

  it("squeezes wide columns instead of overflowing the frame", () => {
    for (const row of renderMarkdown(TABLE, 24)) {
      expect(visibleWidth(row)).toBeLessThanOrEqual(24);
    }
  });

  it("leaves a pipe-bearing line alone when no rule follows it", () => {
    expect(plain(renderMarkdown("| not | a table |", 40))).toContain("| not | a table |");
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

describe("diagrams in a fenced block", () => {
  afterEach(() => setDiagramMode("streaming"));
  const CHART = "```mermaid\nflowchart TD\n  A[Start] --> B[End]\n```";

  it("draws a diagram instead of showing its source", () => {
    const rows = plain(renderMarkdown(CHART, 60));
    expect(rows).toContain("Start");
    expect(rows).not.toContain("flowchart");
  });

  it("falls back to the code block when drawing is switched off", () => {
    // The fallback is the point: a diagram that cannot be drawn has to leave the
    // reader with the code they wrote, not with nothing.
    setDiagramMode("off");
    const rows = plain(renderMarkdown(CHART, 60));
    expect(rows).toContain("flowchart TD");
    expect(rows).toContain("mermaid");
  });

  it("falls back when the diagram does not fit the width", () => {
    // Narrow enough that the code block wraps, so the assertion is on the block
    // being shown rather than on the source surviving one line.
    const rows = plain(renderMarkdown(CHART, 6));
    expect(rows).toContain("mermaid");
    expect(rows).toContain("flow");
  });

  it("falls back when the source is not a diagram", () => {
    const rows = plain(renderMarkdown("```mermaid\nnot a diagram at all\n```", 60));
    expect(rows).toContain("not a diagram at all");
  });

  it("does not draw the same diagram twice", () => {
    // Every delta of a streaming answer re-renders the whole block, so this path
    // is walked many times for one diagram.
    const first = renderMarkdown(CHART, 60);
    const second = renderMarkdown(CHART, 60);
    expect(second).toEqual(first);
  });
});


it("lets Markdown roles differ from surrounding chrome", () => {
  const base = getDefaultTheme();
  defaultTheme.apply({ ...base, colors: { ...base.colors, mdLinkUrl: "#102030", mdQuoteText: "#203040",
    mdQuoteBorder: "#304050", mdListBullet: "#405060", mdRule: "#506070", mdCodeBorder: "#607080" } }, "truecolor");
  try {
    expect(renderInline("[docs](https://example.test)")).toContain(defaultTheme.fg("mdLinkUrl", " (https://example.test)"));
    const quote = renderMarkdown("> quote", 40).join("\n");
    expect(quote).toContain(defaultTheme.fg("mdQuoteText", "quote"));
    expect(quote).toContain(defaultTheme.fg("mdQuoteBorder", "▏"));
    expect(renderMarkdown("- item", 40)[0]).toContain(defaultTheme.fg("mdListBullet", "•"));
    expect(renderMarkdown("---", 40)[0]).toBe(defaultTheme.fg("mdRule", "─".repeat(40)));
    const fence = renderMarkdown("```\nbody\n```", 40);
    expect(fence[1]).toContain(defaultTheme.fg("mdCodeBorder", "│"));
    expect(fence[0]).toContain("\x1b[38;2;96;112;128m┌");
  } finally { defaultTheme.apply(base, "none"); }
});
